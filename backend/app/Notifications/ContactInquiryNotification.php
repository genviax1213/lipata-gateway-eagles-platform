<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ContactInquiryNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $name,
        private readonly string $email,
        private readonly string $subject,
        private readonly string $messageBody,
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $subject = $this->subject !== ''
            ? $this->subject
            : 'New Contact Us Inquiry';

        return (new MailMessage)
            ->subject('[LGEC Contact] ' . $subject)
            ->greeting('New inquiry received')
            ->line('A public Contact Us inquiry was submitted.')
            ->line('Sender: ' . $this->name)
            ->line('Email: ' . $this->email)
            ->line('Subject: ' . ($this->subject !== '' ? $this->subject : 'General Inquiry'))
            ->line('Message:')
            ->line($this->messageBody);
    }
}
