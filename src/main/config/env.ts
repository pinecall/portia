/**
 * Portia Environment — loads .env in dev, reads process.env in production.
 *
 * Single source of truth for all configuration constants.
 * Never import secrets directly — always use ENV.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { RELAY_TIMER_MS } from '@main/constants'

// Load .env from project root (works in dev; in prod, env vars are set by the OS)
config({ path: resolve(__dirname, '../../.env') })

export const ENV = {
  /** Pinecall API key (Cointel.es org) */
  API_KEY: process.env.PORTIA_API_KEY || '',

  /** Twilio SIP domain for registration */
  SIP_DOMAIN: process.env.PORTIA_SIP_DOMAIN || 'testing-mo16m3gw.sip.twilio.com',

  /** SIP identity — how the Zenitel registers with Twilio */
  SIP_NAME: process.env.PORTIA_SIP_NAME || 'zenitel01',
  SIP_ID: process.env.PORTIA_SIP_ID || 'zenitel01',
  SIP_AUTH_USER: process.env.PORTIA_SIP_AUTH_USER || 'zenitel01',
  SIP_AUTH_PASS: process.env.PORTIA_SIP_AUTH_PASS || '',

  /** ElevenLabs voice ID */
  VOICE_ID: process.env.PORTIA_VOICE_ID || 'elevenlabs:h2cd3gvcqTp3m65Dysk7',

  /** LLM model for the agent */
  LLM_MODEL: process.env.PORTIA_LLM_MODEL || 'gpt-4.1-mini',

  /** Default Zenitel credentials */
  ZENITEL_USER: process.env.PORTIA_ZENITEL_USER || 'admin',
  ZENITEL_PASS: process.env.PORTIA_ZENITEL_PASS || '',

  /** Relay timer for door open (ms) — sourced from constants */
  RELAY_TIMER_MS: parseInt(process.env.PORTIA_RELAY_TIMER_MS || '') || RELAY_TIMER_MS,
} as const
