'use client';

import { useState } from 'react';
import { createTicket } from '@/lib/api';

export default function ResidentPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const ticket = await createTicket(title, description, description);
      setSubmitted(ticket);
      setTitle('');
      setDescription('');
    } catch (err) {
      console.error('Failed to create ticket:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Report an Issue</h2>
        <p className="text-gray-400">We&apos;ll get it fixed ASAP</p>
      </div>

      {submitted ? (
        <div className="bg-green-900/30 border border-green-600 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">✓</div>
          <h3 className="text-xl font-semibold text-green-400 mb-2">Ticket Submitted!</h3>
          <p className="text-gray-400 mb-4">ID: {submitted.id.slice(0, 8)}...</p>
          <button
            onClick={() => setSubmitted(null)}
            className="text-blue-400 hover:text-blue-300"
          >
            Submit Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">What&apos;s the issue?</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Boiler making noise"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 text-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tell us more</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the problem..."
              rows={4}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-4 rounded-lg font-semibold text-lg transition-colors"
          >
            {isSubmitting ? 'Sending...' : 'Submit Ticket'}
          </button>
        </form>
      )}
    </div>
  );
}
