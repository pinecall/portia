import { create } from 'zustand'

export interface AppConfig {
  zenitelHost: string
  zenitelUser: string
  zenitelPassword: string
  pinecallApiKey: string
  agentPhone: string
  buildingName: string
  wizardCompleted: boolean
  sipId: string
  language: string
  theme: string
  zenitelHasCamera: boolean
}

interface ConfigStore extends AppConfig {
  setConfig: (updates: Partial<AppConfig>) => Promise<void>
  loadConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigStore>((set) => ({
  zenitelHost: '',
  zenitelUser: 'admin',
  zenitelPassword: 'alphaadmin',
  pinecallApiKey: '',
  agentPhone: '',
  buildingName: '',
  wizardCompleted: false,
  sipId: '',
  language: 'en',
  theme: 'dark',
  zenitelHasCamera: false,

  loadConfig: async () => {
    const config = await window.portia.invoke('config:get')
    set(config)
  },

  setConfig: async (updates) => {
    const config = await window.portia.invoke('config:set', updates)
    set(config)
  },
}))
