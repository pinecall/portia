/**
 * Tool handler types.
 */

import type { PortiaDB } from '../../db'
import type { TcivClient } from 'tciv-client'
import type { Call } from '@pinecall/core'

export interface ToolContext {
  db: PortiaDB
  zenitel: TcivClient
}

export type ToolHandler<TArgs = unknown, TResult = unknown> =
  (args: TArgs, call: Call, ctx: ToolContext) => Promise<TResult>
