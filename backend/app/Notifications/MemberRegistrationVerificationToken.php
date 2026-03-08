<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MemberRegistrationVerificationToken extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $token,
        private readonly string $email
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');
        $verifyPage = $frontendUrl . '/member-registration';

        return (new MailMessage)
            ->subject('Member Registration Verification Token')
            ->greeting('Hello!')
            ->line('Use this verification token to complete your member registration in the portal.')
            ->line("Email: {$this->email}")
            ->line("Verification Token: {$this->token}")
            ->action('Open Member Registration', $verifyPage)
            ->line('If you did not request this registration, you can ignore this email.');
    }

    public function token(): string
    {
        return $this->token;
    }
}
