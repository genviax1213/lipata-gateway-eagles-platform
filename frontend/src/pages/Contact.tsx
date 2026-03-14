import { useState, type FormEvent } from "react";
import api from "../services/api";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSubmitting(true);
    setStatus(null);

    try {
      await api.post("/contact/inquiries", {
        name,
        email,
        subject,
        message,
      });

      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setStatus({
        tone: "success",
        message: "Your inquiry has been sent to the LGEC officers and administrators.",
      });
    } catch (error) {
      const fallback = "Unable to send your inquiry right now. Please try again shortly.";
      const apiMessage = typeof error === "object"
        && error !== null
        && "response" in error
        && typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === "string"
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : fallback;

      setStatus({
        tone: "error",
        message: apiMessage || fallback,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section-wrap py-16 md:py-20">
      <h2 className="mb-8 font-heading text-4xl text-offwhite md:text-5xl">
        Contact Us
      </h2>

      <p className="mb-6 max-w-3xl text-sm text-mist/85">
        Send your inquiry to the club leadership team. Messages are delivered to superadmins, admins, secretaries, and officers.
      </p>

      <form onSubmit={handleSubmit} className="surface-card card-lift reveal space-y-6 p-8 md:p-10">
        {status && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              status.tone === "success"
                ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                : "border-red-400/35 bg-red-500/10 text-red-100"
            }`}
          >
            {status.message}
          </div>
        )}
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-gold-soft">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
            placeholder="Your name"
            required
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gold-soft">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
            placeholder="name@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor="subject" className="mb-2 block text-sm font-semibold text-gold-soft">
            Subject
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
            placeholder="What is your inquiry about?"
          />
        </div>
        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-semibold text-gold-soft">
            Message
          </label>
          <textarea
            id="message"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
            placeholder="How can we help?"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Sending..." : "Send Inquiry"}
        </button>
      </form>
    </section>
  );
}
