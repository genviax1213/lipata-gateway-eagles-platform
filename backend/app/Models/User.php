<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;
use App\Support\RoleHierarchy;
use App\Traits\Auditable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, Auditable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role_id',
        'finance_role',
        'forum_role',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    protected static function booted(): void
    {
        static::created(function (User $user): void {
            self::syncMemberProfile($user);
        });

        static::updated(function (User $user): void {
            if (!$user->wasChanged(['email', 'email_verified_at', 'password', 'role_id'])) {
                return;
            }

            self::syncMemberProfile($user, (string) $user->getOriginal('email'));
        });
    }

    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value === null ? null : Str::of($value)->trim()->lower()->value();
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }

    public function posts()
    {
        return $this->hasMany(Post::class, 'author_id');
    }

    public function memberProfile()
    {
        return $this->hasOne(Member::class);
    }

    public function applicationProfile()
    {
        return $this->hasOne(MemberApplication::class);
    }

    public function hasPermission(string $permission): bool
    {
        $this->loadMissing('role.permissions:id,name');

        if (!$this->role) {
            return $this->hasFinancePermission($permission);
        }

        if ($this->role->permissions->contains('name', $permission)) {
            return true;
        }

        if ($this->hasForumPermission($permission)) {
            return true;
        }

        return $this->hasFinancePermission($permission);
    }

    private function hasFinancePermission(string $permission): bool
    {
        $financeRole = $this->finance_role;
        if (!$financeRole) {
            return false;
        }

        $permissions = match ($financeRole) {
            RoleHierarchy::FINANCE_TREASURER => RoleHierarchy::treasurerPermissions(),
            RoleHierarchy::FINANCE_AUDITOR => RoleHierarchy::auditorPermissions(),
            default => [],
        };

        return in_array($permission, $permissions, true);
    }

    private function hasForumPermission(string $permission): bool
    {
        $forumRole = $this->forum_role;
        if (!$forumRole) {
            return false;
        }

        $permissions = match ($forumRole) {
            RoleHierarchy::FORUM_MODERATOR => RoleHierarchy::forumModeratorPermissions(),
            default => [],
        };

        return in_array($permission, $permissions, true);
    }

    private static function syncMemberProfile(User $user, ?string $previousEmail = null): void
    {
        $normalizedEmail = Str::of((string) $user->email)->trim()->lower()->value();
        if ($normalizedEmail === '') {
            return;
        }

        $member = Member::query()
            ->where('user_id', $user->id)
            ->first();

        if (!$member) {
            $memberByEmail = Member::query()->where('email', $normalizedEmail)->first();
            if ($memberByEmail && $memberByEmail->user_id === null) {
                $member = $memberByEmail;
            } elseif (!$memberByEmail && $previousEmail !== null && $previousEmail !== '') {
                $normalizedPreviousEmail = Str::of($previousEmail)->trim()->lower()->value();
                $memberByPreviousEmail = Member::query()->where('email', $normalizedPreviousEmail)->first();
                if ($memberByPreviousEmail && $memberByPreviousEmail->user_id === null) {
                    $member = $memberByPreviousEmail;
                }
            } elseif ($memberByEmail && $memberByEmail->user_id !== $user->id) {
                Log::warning('user.member_profile_conflict', [
                    'user_id' => $user->id,
                    'email' => $normalizedEmail,
                    'member_id' => $memberByEmail->id,
                    'member_user_id' => $memberByEmail->user_id,
                ]);
                return;
            }
        }

        $emailVerified = $user->email_verified_at !== null;
        $passwordSet = !empty($user->password);

        if (!$member) {
            return;
        }

        $member->fill([
            'user_id' => $user->id,
            'email' => $normalizedEmail,
            'email_verified' => $emailVerified,
            'password_set' => $passwordSet,
        ]);

        $member->save();
    }
}
