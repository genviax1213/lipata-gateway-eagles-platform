<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('visitor_page_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('visitor_session_id')->constrained('visitor_sessions')->cascadeOnDelete();
            $table->string('visitor_token', 100)->index();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('path', 512)->index();
            $table->string('page_title')->nullable();
            $table->string('referrer', 1024)->nullable();
            $table->string('event_type', 32)->default('page_view');
            $table->timestamp('viewed_at')->index();
            $table->boolean('is_authenticated')->default(false)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('visitor_page_views');
    }
};
