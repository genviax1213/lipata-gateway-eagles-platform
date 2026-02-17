<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

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

        $map = [
            'treasurer' => [
                'finance.view',
                'finance.input',
                'finance.request_edit',
            ],
            'auditor' => [
                'finance.view',
                'finance.approve_edits',
            ],
        ];

        return in_array($permission, $map[$financeRole] ?? [], true);
    }

    private function hasForumPermission(string $permission): bool
    {
        $forumRole = $this->forum_role;
        if (!$forumRole) {
            return false;
        }

        $map = [
            'forum_moderator' => [
                'forum.view',
                'forum.create_thread',
                'forum.reply',
                'forum.moderate',
            ],
        ];

        return in_array($permission, $map[$forumRole] ?? [], true);
    }
}
