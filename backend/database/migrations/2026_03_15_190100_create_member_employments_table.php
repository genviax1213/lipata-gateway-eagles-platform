<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('member_employments')) {
            return;
        }

        Schema::create('member_employments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained()->cascadeOnDelete();
            $table->string('office_name', 180)->nullable();
            $table->string('line_of_business', 180)->nullable();
            $table->string('office_address', 255)->nullable();
            $table->string('job_title', 180)->nullable();
            $table->string('office_telephone', 50)->nullable();
            $table->string('office_fax', 50)->nullable();
            $table->boolean('is_current')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_employments');
    }
};
