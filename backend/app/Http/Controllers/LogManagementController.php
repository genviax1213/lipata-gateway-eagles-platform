<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class LogManagementController extends Controller
{
    private const ARCHIVE_RETENTION_DAYS = 730;
    private const MAX_PER_PAGE = 100;

    private function logsDir(): string
    {
        return storage_path('logs');
    }

    private function archiveDir(): string
    {
        return $this->logsDir() . DIRECTORY_SEPARATOR . 'archive';
    }

    private function currentLogPath(): string
    {
        return $this->logsDir() . DIRECTORY_SEPARATOR . 'laravel.log';
    }

    private function currentLogFiles(): array
    {
        $files = [];
        $default = $this->currentLogPath();
        if (File::exists($default)) {
            $files[] = $default;
        }

        foreach (File::glob($this->logsDir() . DIRECTORY_SEPARATOR . 'laravel-*.log') as $candidate) {
            if (is_string($candidate) && File::exists($candidate)) {
                $files[] = $candidate;
            }
        }

        return array_values(array_unique($files));
    }

    public function index(Request $request)
    {
        $this->purgeExpiredArchives();

        $validated = $request->validate([
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:' . self::MAX_PER_PAGE,
            'level' => 'nullable|string|max:20',
            'event' => 'nullable|string|max:255',
            'q' => 'nullable|string|max:255',
        ]);

        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);
        $level = Str::upper((string) ($validated['level'] ?? ''));
        $event = trim((string) ($validated['event'] ?? ''));
        $query = Str::lower(trim((string) ($validated['q'] ?? '')));

        $entries = $this->readEntriesFromCurrentFiles()
            ->filter(function (array $entry) use ($level, $event, $query) {
                if ($level !== '' && Str::upper((string) ($entry['level'] ?? '')) !== $level) {
                    return false;
                }

                if ($event !== '' && !Str::contains((string) ($entry['event'] ?? ''), $event, true)) {
                    return false;
                }

                if ($query !== '') {
                    $haystack = Str::lower(
                        implode(' ', [
                            (string) ($entry['event'] ?? ''),
                            (string) ($entry['message'] ?? ''),
                            json_encode($entry['context'] ?? []),
                        ])
                    );

                    if (!Str::contains($haystack, $query)) {
                        return false;
                    }
                }

                return true;
            })
            ->values();

        $total = $entries->count();
        $offset = max(0, ($page - 1) * $perPage);
        $data = $entries->slice($offset, $perPage)->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / max(1, $perPage))),
                'source' => 'current',
            ],
        ]);
    }

    public function clearCurrent()
    {
        $currentFiles = $this->currentLogFiles();
        if ($currentFiles === []) {
            return response()->json([
                'message' => 'Current log file not found.',
            ], 404);
        }

        foreach ($currentFiles as $path) {
            file_put_contents($path, '', LOCK_EX);
        }

        return response()->json([
            'message' => 'Current log files cleared.',
            'files_cleared' => count($currentFiles),
        ]);
    }

    public function downloadCurrent()
    {
        $currentFiles = $this->currentLogFiles();
        if ($currentFiles === []) {
            return response()->json([
                'message' => 'Current log file not found.',
            ], 404);
        }

        $lines = [];
        foreach ($currentFiles as $path) {
            $lines[] = sprintf("===== %s =====", basename($path));
            $lines[] = File::get($path);
            $lines[] = '';
        }

        $payload = implode("\n", $lines);

        return response($payload, 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="laravel.log"',
        ]);
    }

    public function compressCurrent()
    {
        $this->purgeExpiredArchives();

        $currentFiles = $this->currentLogFiles();
        if ($currentFiles === []) {
            return response()->json([
                'message' => 'Current log file is empty. Nothing to compress.',
            ], 422);
        }

        $combined = '';
        foreach ($currentFiles as $path) {
            $content = File::get($path);
            if ($content === '') {
                continue;
            }
            $combined .= sprintf("===== %s =====\n%s\n", basename($path), $content);
        }

        if ($combined === '') {
            return response()->json([
                'message' => 'Current log file is empty. Nothing to compress.',
            ], 422);
        }

        if (!File::exists($this->archiveDir())) {
            File::ensureDirectoryExists($this->archiveDir());
        }

        $timestamp = now()->format('Ymd_His');
        $archiveName = "laravel_{$timestamp}.log.gz";
        $archivePath = $this->archiveDir() . DIRECTORY_SEPARATOR . $archiveName;

        $compressed = gzencode($combined, 9);
        if ($compressed === false) {
            return response()->json([
                'message' => 'Unable to compress current logs.',
            ], 422);
        }

        File::put($archivePath, $compressed);
        foreach ($currentFiles as $path) {
            file_put_contents($path, '', LOCK_EX);
        }

        return response()->json([
            'message' => 'Current logs compressed and archived.',
            'archive' => [
                'name' => $archiveName,
                'size_bytes' => File::size($archivePath),
                'created_at' => now()->toISOString(),
            ],
        ]);
    }

    public function archives()
    {
        $deleted = $this->purgeExpiredArchives();
        $files = $this->listArchives();

        return response()->json([
            'data' => $files,
            'meta' => [
                'deleted_expired' => $deleted,
            ],
        ]);
    }

    public function archiveContent(Request $request, string $archive)
    {
        $validated = $request->validate([
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:' . self::MAX_PER_PAGE,
        ]);

        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);
        $path = $this->resolveArchivePath($archive);
        if ($path === null) {
            return response()->json(['message' => 'Invalid archive filename.'], 422);
        }

        if (!File::exists($path)) {
            return response()->json(['message' => 'Archive not found.'], 404);
        }

        $raw = File::get($path);
        $decoded = gzdecode($raw);
        if ($decoded === false) {
            return response()->json(['message' => 'Unable to decode archive content.'], 422);
        }

        $entries = $this->parseEntries($decoded)->values();
        $total = $entries->count();
        $offset = max(0, ($page - 1) * $perPage);
        $data = $entries->slice($offset, $perPage)->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / max(1, $perPage))),
                'source' => 'archive',
                'archive' => $archive,
            ],
        ]);
    }

    public function deleteArchive(string $archive)
    {
        $path = $this->resolveArchivePath($archive);
        if ($path === null) {
            return response()->json(['message' => 'Invalid archive filename.'], 422);
        }
        if (!File::exists($path)) {
            return response()->json(['message' => 'Archive not found.'], 404);
        }

        File::delete($path);

        return response()->json([
            'message' => 'Archive deleted.',
        ]);
    }

    public function downloadArchive(string $archive)
    {
        $path = $this->resolveArchivePath($archive);
        if ($path === null) {
            return response()->json(['message' => 'Invalid archive filename.'], 422);
        }

        if (!File::exists($path)) {
            return response()->json(['message' => 'Archive not found.'], 404);
        }

        return response()->download($path, basename($path), [
            'Content-Type' => 'application/gzip',
        ]);
    }

    private function listArchives(): array
    {
        if (!File::exists($this->archiveDir())) {
            return [];
        }

        return collect(File::files($this->archiveDir()))
            ->filter(fn ($file) => Str::endsWith($file->getFilename(), '.log.gz'))
            ->map(fn ($file) => [
                'name' => $file->getFilename(),
                'size_bytes' => $file->getSize(),
                'modified_at' => date(DATE_ATOM, $file->getMTime()),
            ])
            ->sortByDesc('modified_at')
            ->values()
            ->all();
    }

    private function resolveArchivePath(string $archive): ?string
    {
        $name = basename($archive);
        if (!preg_match('/^[A-Za-z0-9._-]+\.log\.gz$/', $name)) {
            return null;
        }

        return $this->archiveDir() . DIRECTORY_SEPARATOR . $name;
    }

    private function purgeExpiredArchives(): int
    {
        if (!File::exists($this->archiveDir())) {
            return 0;
        }

        $threshold = now()->subDays(self::ARCHIVE_RETENTION_DAYS)->getTimestamp();
        $deleted = 0;

        foreach (File::files($this->archiveDir()) as $file) {
            if (!Str::endsWith($file->getFilename(), '.log.gz')) {
                continue;
            }

            if ($file->getMTime() < $threshold) {
                if (File::delete($file->getRealPath())) {
                    $deleted++;
                }
            }
        }

        return $deleted;
    }

    private function readEntriesFromFile(string $path): Collection
    {
        if (!File::exists($path)) {
            return collect();
        }

        return $this->parseEntries(File::get($path));
    }

    private function readEntriesFromCurrentFiles(): Collection
    {
        $entries = collect();
        foreach ($this->currentLogFiles() as $path) {
            $entries = $entries->merge($this->readEntriesFromFile($path)->all());
        }

        return $entries->sortByDesc(function (array $entry) {
            return strtotime((string) ($entry['timestamp'] ?? '')) ?: 0;
        })->values();
    }

    private function parseEntries(string $content): Collection
    {
        $lines = preg_split("/\r\n|\n|\r/", $content) ?: [];
        $entries = [];
        $buffer = '';

        foreach ($lines as $line) {
            if (preg_match('/^\[[0-9]{4}-[0-9]{2}-[0-9]{2}\s[0-9]{2}:[0-9]{2}:[0-9]{2}\]\s/', $line)) {
                if ($buffer !== '') {
                    $entries[] = $this->parseEntry($buffer);
                }
                $buffer = $line;
                continue;
            }

            if ($buffer === '') {
                $buffer = $line;
            } else {
                $buffer .= "\n" . $line;
            }
        }

        if ($buffer !== '') {
            $entries[] = $this->parseEntry($buffer);
        }

        return collect(array_reverse($entries));
    }

    private function parseEntry(string $raw): array
    {
        $fallback = [
            'timestamp' => null,
            'level' => 'UNKNOWN',
            'event' => '',
            'message' => $raw,
            'context' => null,
            'raw' => $raw,
        ];

        if (!preg_match('/^\[(?<timestamp>[^\]]+)\]\s+(?<channel>[A-Za-z0-9_-]+)\.(?<level>[A-Z]+):\s+(?<body>.*)$/s', $raw, $m)) {
            return $fallback;
        }

        $body = (string) ($m['body'] ?? '');
        $message = $body;
        $context = null;

        if (preg_match('/^(?<message>.*)\s(?<context>\{.*\})$/s', $body, $parts)) {
            $possibleContext = json_decode((string) $parts['context'], true);
            if (is_array($possibleContext)) {
                $message = (string) $parts['message'];
                $context = $possibleContext;
            }
        }

        return [
            'timestamp' => (string) ($m['timestamp'] ?? ''),
            'level' => (string) ($m['level'] ?? 'UNKNOWN'),
            'event' => trim($message),
            'message' => trim($message),
            'context' => $context,
            'raw' => $raw,
        ];
    }
}
