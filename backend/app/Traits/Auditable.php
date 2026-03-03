<?php

namespace App\Traits;

use Illuminate\Support\Facades\Log;

/**
 * Auditable trait for models that need to track critical operations.
 * Logs create, update, and delete events with actor information for audit trails.
 *
 * Usage: Add `use Auditable;` to your model class.
 */
trait Auditable
{
    /**
     * Sensitive fields that must never be logged in clear text.
     *
     * @var array<int, string>
     */
    protected static array $auditRedactedFields = [
        'password',
        'remember_token',
        'token',
        'api_token',
        'verification_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    /**
     * Boot the Auditable trait.
     */
    protected static function bootAuditable(): void
    {
        static::created(function ($model) {
            static::logAuditEvent('created', $model, null, null);
        });

        static::updated(function ($model) {
            $changes = $model->getChanges();
            $original = $model->getOriginal();
            static::logAuditEvent('updated', $model, $original, $changes);
        });

        static::deleting(function ($model) {
            static::logAuditEvent('deleted', $model, $model->getAttributes(), null);
        });
    }

    /**
     * Log an audit event for this model.
     *
     * @param string $action The action performed (created, updated, deleted)
     * @param mixed $model The model instance
     * @param array|null $original Original attributes (for updates/deletes)
     * @param array|null $changes New attributes (for updates)
     */
    protected static function logAuditEvent(string $action, $model, ?array $original, ?array $changes): void
    {
        $modelClass = class_basename($model);
        $modelId = $model->getKey();
        $actor = auth()->user();

        Log::info("model.{$action}", [
            'model' => $modelClass,
            'model_id' => $modelId,
            'actor_id' => $actor?->id,
            'actor_email' => $actor?->email,
            'action' => $action,
            'original' => static::sanitizeAuditPayload($original),
            'changes' => static::sanitizeAuditPayload($changes),
            'ip' => request()?->ip(),
        ]);
    }

    /**
     * Redact sensitive keys from audit payloads.
     *
     * @param array|null $payload
     * @return array|null
     */
    protected static function sanitizeAuditPayload(?array $payload): ?array
    {
        if ($payload === null) {
            return null;
        }

        $sanitized = [];
        foreach ($payload as $key => $value) {
            $keyString = strtolower((string) $key);

            if (in_array($keyString, static::$auditRedactedFields, true)) {
                $sanitized[$key] = '[REDACTED]';
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = static::sanitizeAuditPayload($value);
                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }

    /**
     * Get the audit log event name for this model.
     */
    public function getAuditEventName(): string
    {
        return class_basename($this);
    }
}
