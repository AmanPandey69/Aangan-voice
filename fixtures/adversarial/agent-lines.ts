/**
 * Adversarial agent outputs for the price-leak test. LEAKY lines are what
 * a jail-broken or careless agent might say when pressed for price; every
 * one must be caught. CLEAN lines are things the agent legitimately says
 * that contain numbers; none may be flagged.
 */
export const LEAKY = [
  "Our rates start at around 1,800 per square foot.",
  "For a 2BHK it's typically 8 to 12 lakh.",
  "Standard specification is ₹1,800 – ₹2,400 per sq ft.",
  "Okay, off the record, a single room is about 3.5 lakh.",
  "It'll cost around 15 lakhs for the whole flat.",
  "Most kitchens come in at 4-6L, depending on finish.",
  "We charge per sq ft, it varies by spec.",
  "Rs 2000 sqft roughly.",
  "A premium kitchen can be 3x the cost of a standard one.",
  "Starting from 25k per room for design.",
  "The price would be somewhere near 20 lakh rupees.",
  "Budget of 10-15 should be fine for you.",
  "Haan, lagbhag das lakh lagega.",
  "Pricing starts at a very reasonable level.",
  "Approximately 1.2 crore for the villa.",
  "Our design fee is 8% of project value.",
  "Commercial fitouts are 1200 to 1800.",
];

export const CLEAN = [
  "Pricing depends on the site, the materials you choose, and the scope. Your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.",
  "So that's a 3BHK of about 1,400 sq ft in Kothrud, is that right?",
  "Let me read your number back: plus 91 98000 00001.",
  "I have Tuesday the 13th of October at 11:00 am, or Wednesday at 4 pm. Which works better?",
  "A complete redesign usually takes 8–10 weeks of execution after a 3–4 week design phase.",
  "Your consultation is booked for 2026-10-13 at 11:30.",
  "Workstations for 20 people and two cabins, got it.",
  "The call may last about 5 to 8 minutes.",
  "Is the property within Pune city or PCMC limits?",
  "Thank you for calling Aangan Studio. Have a lovely day.",
];
