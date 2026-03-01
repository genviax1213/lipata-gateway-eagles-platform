<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MemberApplicationVerificationToken extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $token,
        private readonly string $email
    ) {
    }

    public function token(): string
    {
        return $this->token;
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) env('FRONTEND_URL', 'http://127.0.0.1:5173'), '/');
        $verifyPage = $frontendUrl . '/member-application';

        return (new MailMessage)
            ->subject('Member Application Verification Token')
            ->line('Use this verification token to continue your application review workflow.')
            ->line('Email: ' . $this->email)
            ->line('Verification Token: ' . $this->token)
            ->action('Open Application Page', $verifyPage)
            ->line('If you did not initiate this application, please ignore this message.');
    }
}
