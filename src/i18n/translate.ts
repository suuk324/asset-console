import type {
  Discipline,
  ImportMode,
  ProjectStatus,
  SupportedLanguage,
} from '../types/domain'
import { messages, type MessageKey } from './messages'

export function t(language: SupportedLanguage, key: MessageKey) {
  return messages[language][key]
}

export function disciplineLabel(language: SupportedLanguage, discipline: Discipline) {
  switch (discipline) {
    case 'Product Design':
      return t(language, 'productDesign')
    case 'Branding':
      return t(language, 'branding')
    case 'Spatial':
      return t(language, 'spatial')
    case 'Motion':
      return t(language, 'motion')
    case 'Cross-disciplinary':
      return t(language, 'crossDisciplinary')
  }
}

export function statusLabel(language: SupportedLanguage, status: ProjectStatus) {
  switch (status) {
    case 'Active':
      return t(language, 'active')
    case 'Review':
      return t(language, 'review')
    case 'Archived':
      return t(language, 'archived')
  }
}

export function importModeLabel(language: SupportedLanguage, mode: ImportMode) {
  switch (mode) {
    case 'auto':
      return t(language, 'importModeAuto')
    case 'manual':
      return t(language, 'importModeManual')
    case 'current_project':
      return t(language, 'importModeCurrent')
  }
}
