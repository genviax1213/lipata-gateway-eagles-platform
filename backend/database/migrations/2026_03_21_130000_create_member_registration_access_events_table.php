<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_registration_access_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('member_registration_id')->nullable()->constrained()->nullOnDelete();
            $table->string('visitor_token', 100)->nullable()->index();
            $table->string('session_token', 100)->nullable()->index();
            $table->string('email')->nullable()->index();
            $table->string('event_type', 50);
            $table->string('status', 40);
            $table->string('route_path', 255)->default('/member-registration');
            $table->string('tab', 30)->nullable();
            $table->text('message')->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->timestamp('occurred_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_registration_access_events');
    }
};
