import { env, requireSecret } from "@/lib/env";
import type { Repo } from "@/lib/db/repo";
import { MemoryRepo } from "@/lib/db/memory";
import { SupabaseRepo } from "@/lib/db/supabase";
import type { VoiceProvider } from "@/lib/adapters/voice/types";
import type { CalendarProvider } from "@/lib/adapters/calendar/types";
import type { CRMProvider } from "@/lib/adapters/crm/types";
import type { Notifier } from "@/lib/adapters/notifier/types";
import type { LLMProvider } from "@/lib/adapters/llm/types";
import { MockVoice } from "@/lib/adapters/voice/mock";
import { MockCalendar } from "@/lib/adapters/calendar/mock";
import { MockCRM } from "@/lib/adapters/crm/mock";
import { MockNotifier } from "@/lib/adapters/notifier/mock";
import { MockLLM } from "@/lib/adapters/llm/mock";
import { AnthropicLLM } from "@/lib/adapters/llm/anthropic";
import { VaaniVoice } from "@/lib/adapters/voice/vaani";
import { CalcomCalendar } from "@/lib/adapters/calendar/calcom";
import { HubSpotCRM } from "@/lib/adapters/crm/hubspot";
import { ResendNotifier } from "@/lib/adapters/notifier/resend";

export interface Services {
  repo: Repo;
  voice: VoiceProvider;
  calendar: CalendarProvider;
  crm: CRMProvider;
  notifier: Notifier;
  llm: LLMProvider;
}

const g = globalThis as unknown as { __aanganServices?: Services; __aanganMemoryRepo?: MemoryRepo };

/** Build services from env. Each adapter is real only if its keys exist and MOCK_MODE != "true". */
export function buildServices(): Services {
  const mock = env.mockAll;
  const real = (...keys: (string | undefined)[]) => !mock && keys.every(Boolean);

  const repo: Repo = real(env.supabaseUrl(), env.supabaseServiceRoleKey())
    ? new SupabaseRepo(env.supabaseUrl()!, env.supabaseServiceRoleKey()!)
    : (g.__aanganMemoryRepo ??= new MemoryRepo());

  const vaaniSecret = requireSecret(env.vaaniWebhookSecret(), "VAANI_WEBHOOK_SECRET");
  const calSecret = requireSecret(env.calcomWebhookSecret(), "CALCOM_WEBHOOK_SECRET");

  return {
    repo,
    // Vaani is "real" once its webhook secret is set; the API key adds caller-number lookup.
    voice: real(env.vaaniWebhookSecret()) ? new VaaniVoice(env.vaaniApiKey(), vaaniSecret) : new MockVoice(vaaniSecret),
    calendar: real(env.calcomApiKey(), env.calcomEventTypeId(), env.calcomWebhookSecret())
      ? new CalcomCalendar(env.calcomApiKey()!, env.calcomEventTypeId()!, calSecret)
      : new MockCalendar(calSecret),
    crm: real(env.hubspotToken()) ? new HubSpotCRM(env.hubspotToken()!, env.hubspotPortalId()) : new MockCRM(),
    notifier: real(env.resendApiKey())
      ? new ResendNotifier(env.resendApiKey()!, env.fromEmail(), env.resendWebhookSecret())
      : new MockNotifier(requireSecret(env.resendWebhookSecret(), "RESEND_WEBHOOK_SECRET")),
    llm: real(env.llmApiKey()) ? new AnthropicLLM(env.llmApiKey()!) : new MockLLM(),
  };
}

export function services(): Services {
  return (g.__aanganServices ??= buildServices());
}

/** Tests inject their own services. */
export function setServices(s: Services | undefined) { g.__aanganServices = s; }

export function adapterModes(s: Services = services()) {
  return { db: s.repo.kind, voice: s.voice.name, calendar: s.calendar.name, crm: s.crm.name, email: s.notifier.name, llm: s.llm.name };
}
