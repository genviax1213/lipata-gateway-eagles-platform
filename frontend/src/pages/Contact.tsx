import type { FormEvent } from "react";

export default function Contact() {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <section className="section-wrap py-16 md:py-20">
      <h2 className="mb-8 font-heading text-4xl text-offwhite md:text-5xl">
        Contact Us
      </h2>

      <form onSubmit={handleSubmit} className="surface-card card-lift reveal space-y-6 p-8 md:p-10">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-gold-soft">
            Name
          </label>
          <input
            id="name"
            type="text"
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
            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
            placeholder="name@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-semibold text-gold-soft">
            Message
          </label>
          <textarea
            id="message"
            rows={4}
            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
            placeholder="How can we help?"
            required
          />
        </div>
        <button type="submit" className="btn-primary">
          Send Inquiry
        </button>
      </form>
    </section>
  );
}
