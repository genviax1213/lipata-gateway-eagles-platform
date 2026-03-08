<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\GoogleOAuthController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/oauth/google/redirect', [GoogleOAuthController::class, 'redirect'])
    ->middleware('throttle:google-oauth');
Route::get('/oauth/google/callback', [GoogleOAuthController::class, 'callback'])
    ->middleware('throttle:google-oauth');
