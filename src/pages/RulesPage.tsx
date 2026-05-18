import { useMemo, useState, type FormEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EmptyState } from '../components/common/EmptyState'
import { SectionHeader } from '../components/common/SectionHeader'
import { t } from '../i18n/translate'
import { useAssetConsoleStore } from '../store/useAssetConsoleStore'
import type { ClassificationRule, ProjectFolder } from '../types/domain'
import pageStyles from './Page.module.css'

function parseTokens(value: string) {
  return value
    .split(/[\n,\s]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
}

interface RuleTemplate {
  id: string
  title: { 'zh-CN': string; 'en-US': string }
  description: { 'zh-CN': string; 'en-US': string }
  name: { 'zh-CN': string; 'en-US': string }
  keywordsText: string
  formatsText: string
  suggestedTagsText: string
  note: { 'zh-CN': string; 'en-US': string }
  confidence: number
  folderHints: string[]
}

const ruleTemplates: RuleTemplate[] = [
  {
    id: 'reference-images',
    title: {
      'zh-CN': '参考图模板',
      'en-US': 'Reference Images',
    },
    description: {
      'zh-CN': '适合灵感图、CMF 参考和情绪板素材。',
      'en-US': 'For inspiration boards, CMF references, and moodboard material.',
    },
    name: {
      'zh-CN': '参考图自动归档',
      'en-US': 'Reference Image Routing',
    },
    keywordsText: 'reference, moodboard, inspiration, cmf, 材质, 灵感, 参考',
    formatsText: 'jpg, jpeg, png, webp, gif',
    suggestedTagsText: '参考图, 灵感, CMF',
    note: {
      'zh-CN': '命中后优先进入参考资料目录，方便前期调研和整理。',
      'en-US': 'Route matched files into the reference folder for early research work.',
    },
    confidence: 0.84,
    folderHints: ['reference', 'references', 'inspiration', 'mood', '参考', '灵感'],
  },
  {
    id: 'model-files',
    title: {
      'zh-CN': '3D 文件模板',
      'en-US': '3D Model Files',
    },
    description: {
      'zh-CN': '适合建模源文件、3DM、OBJ、STP 等模型文件。',
      'en-US': 'For source models such as 3DM, OBJ, STEP, and related files.',
    },
    name: {
      'zh-CN': '3D 模型自动归档',
      'en-US': '3D Model Routing',
    },
    keywordsText: 'model, 3d, rhino, cad, 建模, 模型, 结构',
    formatsText: '3dm, obj, stl, step, stp, fbx, blend, glb, gltf',
    suggestedTagsText: '3D, 模型, 建模',
    note: {
      'zh-CN': '命中后优先进入 3D 或建模目录，减少模型散落在项目根目录。',
      'en-US': 'Route matched files into 3D/model folders instead of leaving them at the root.',
    },
    confidence: 0.9,
    folderHints: ['3d', 'model', 'models', '建模', '模型', '结构'],
  },
  {
    id: 'final-output',
    title: {
      'zh-CN': '最终输出模板',
      'en-US': 'Final Output',
    },
    description: {
      'zh-CN': '适合最终渲染、交付图、展示板和汇报文件。',
      'en-US': 'For final renders, boards, and delivery files.',
    },
    name: {
      'zh-CN': '最终成品自动归档',
      'en-US': 'Final Deliverable Routing',
    },
    keywordsText: 'final, render, board, deliver, 汇报, 成品, 终版, 最终',
    formatsText: 'png, jpg, pdf, pptx, key, mp4',
    suggestedTagsText: '最终版, 输出, 成品',
    note: {
      'zh-CN': '命中后优先进入 Final、Renders 或展示输出目录。',
      'en-US': 'Route matched files into Final, Renders, or presentation output folders.',
    },
    confidence: 0.88,
    folderHints: ['final', 'render', 'renders', 'output', 'finals', '终版', '成品', '输出'],
  },
]

function pickTemplateFolderId(projectId: string, folders: ProjectFolder[], hints: string[]) {
  const projectFolders = folders.filter((folder) => folder.projectId === projectId)
  const matchedFolder = projectFolders.find((folder) => {
    const normalizedPath = folder.relativePath.toLowerCase()
    return hints.some((hint) => normalizedPath.includes(hint.toLowerCase()))
  })

  return matchedFolder?.id ?? projectFolders[0]?.id ?? ''
}

export function RulesPage() {
  const { settings, projects, folders, rules, saveRule, removeRule } = useAssetConsoleStore(
    useShallow((state) => ({
      settings: state.settings,
      projects: state.projects,
      folders: state.folders,
      rules: state.rules,
      saveRule: state.saveRule,
      removeRule: state.removeRule,
    })),
  )

  const language = settings.language
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(rules[0]?.id ?? null)
  const effectiveSelectedRuleId =
    selectedRuleId && rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : (rules[0]?.id ?? null)
  const initialRule = useMemo(
    () => rules.find((rule) => rule.id === effectiveSelectedRuleId) ?? null,
    [effectiveSelectedRuleId, rules],
  )

  const [form, setForm] = useState(() => ({
    id: initialRule?.id ?? '',
    name: initialRule?.name ?? '',
    enabled: initialRule?.enabled ?? true,
    keywordsText: initialRule?.keywords.join(', ') ?? '',
    formatsText: initialRule?.formats.join(', ') ?? '',
    targetProjectId: initialRule?.targetProjectId ?? projects[0]?.id ?? '',
    targetFolderId: initialRule?.targetFolderId ?? folders[0]?.id ?? '',
    suggestedTagsText: initialRule?.suggestedTags.join(', ') ?? '',
    confidence: initialRule?.confidence ?? 0.82,
    note: initialRule?.note ?? '',
  }))

  const availableFolders = folders.filter((folder) => folder.projectId === form.targetProjectId)
  const enabledCount = rules.filter((rule) => rule.enabled).length
  const attentionCount = rules.filter((rule) => rule.needsAttention).length

  const handleFill = (rule: ClassificationRule | null) => {
    setForm({
      id: rule?.id ?? '',
      name: rule?.name ?? '',
      enabled: rule?.enabled ?? true,
      keywordsText: rule?.keywords.join(', ') ?? '',
      formatsText: rule?.formats.join(', ') ?? '',
      targetProjectId: rule?.targetProjectId ?? projects[0]?.id ?? '',
      targetFolderId:
        rule?.targetFolderId ??
        folders.find((folder) => folder.projectId === (rule?.targetProjectId ?? projects[0]?.id))?.id ??
        '',
      suggestedTagsText: rule?.suggestedTags.join(', ') ?? '',
      confidence: rule?.confidence ?? 0.82,
      note: rule?.note ?? '',
    })
  }

  const applyTemplate = (template: RuleTemplate) => {
    const targetProjectId = form.targetProjectId || projects[0]?.id || ''
    const targetFolderId = pickTemplateFolderId(targetProjectId, folders, template.folderHints)

    setSelectedRuleId(null)
    setForm({
      id: '',
      name: template.name[language],
      enabled: true,
      keywordsText: template.keywordsText,
      formatsText: template.formatsText,
      targetProjectId,
      targetFolderId,
      suggestedTagsText: template.suggestedTagsText,
      confidence: template.confidence,
      note: template.note[language],
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const folder = folders.find((entry) => entry.id === form.targetFolderId)
    if (!folder || !form.name.trim()) {
      return
    }

    await saveRule({
      id: form.id || `rule-${Date.now().toString(36)}`,
      name: form.name.trim(),
      enabled: form.enabled,
      keywords: parseTokens(form.keywordsText),
      formats: parseTokens(form.formatsText).map((value) => value.toLowerCase()),
      targetProjectId: form.targetProjectId,
      targetFolderId: folder.id,
      targetRelativePath: folder.relativePath,
      suggestedTags: parseTokens(form.suggestedTagsText),
      confidence: Number(form.confidence),
      note: form.note.trim(),
      needsAttention: false,
    })
  }

  return (
    <div className={`${pageStyles.page} ${pageStyles.pageStatic}`}>
      <SectionHeader
        eyebrow={language === 'zh-CN' ? '规则' : t(language, 'rulesEyebrow')}
        title={language === 'zh-CN' ? '规则管理' : 'Rules'}
        description={
          language === 'zh-CN'
            ? '把命中条件稳定映射到真实项目目录，减少导入时的重复判断。'
            : 'Route matched files into real project folders with predictable automation.'
        }
        compact
        meta={<span className={pageStyles.headerMetaChip}>{rules.length}</span>}
      />

      <div className={pageStyles.statusRow}>
        <span className={pageStyles.statusBadgeActive}>
          {language === 'zh-CN' ? '规则总数' : 'Rules'} {rules.length}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {language === 'zh-CN' ? '已启用' : 'Enabled'} {enabledCount}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {language === 'zh-CN' ? '待处理' : 'Needs Attention'} {attentionCount}
        </span>
      </div>

      <div className={pageStyles.workbenchGrid}>
        <section className={`${pageStyles.panel} ${pageStyles.sidebarPanel}`}>
          <div className={pageStyles.panelHeader}>
            <div>
              <h2>{language === 'zh-CN' ? '规则列表' : 'Rule List'}</h2>
              <p>{language === 'zh-CN' ? '左侧切换，右侧集中编辑。' : 'Switch on the left and edit on the right.'}</p>
            </div>
            <button
              type="button"
              className={pageStyles.secondaryButton}
              onClick={() => {
                setSelectedRuleId(null)
                handleFill(null)
              }}
            >
              {language === 'zh-CN' ? '新建规则' : 'New Rule'}
            </button>
          </div>

          {rules.length === 0 ? (
            <EmptyState
              title={language === 'zh-CN' ? '还没有分类规则。' : 'No rules yet.'}
              body={
                language === 'zh-CN'
                  ? '先在右侧套用一个模板，再把目标项目和目标目录改成你自己的真实目录。'
                  : 'Start with a template on the right, then retarget it to your real project folders.'
              }
            />
          ) : (
            <div className={`${pageStyles.list} ${pageStyles.scrollArea}`}>
              {rules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className={
                    effectiveSelectedRuleId === rule.id ? pageStyles.ruleCardButtonActive : pageStyles.ruleCardButton
                  }
                  onClick={() => {
                    setSelectedRuleId(rule.id)
                    handleFill(rule)
                  }}
                >
                  <div className={pageStyles.ruleCardCopy}>
                    <strong>{rule.name}</strong>
                    <span>{rule.targetRelativePath || '/'}</span>
                  </div>
                  <span>{rule.needsAttention ? t(language, 'needsAttention') : `${Math.round(rule.confidence * 100)}%`}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={`${pageStyles.panel} ${pageStyles.mainPanel}`}>
          <div className={pageStyles.editorHeader}>
            <div className={pageStyles.editorHeaderCopy}>
              <p className={pageStyles.eyebrowCompact}>{language === 'zh-CN' ? '编辑器' : 'Editor'}</p>
              <h2>{form.id ? (language === 'zh-CN' ? '编辑规则' : 'Edit Rule') : (language === 'zh-CN' ? '新建规则' : 'Create Rule')}</h2>
              <span className={pageStyles.mutedText}>
                {language === 'zh-CN'
                  ? '先套模板，再改目标目录和关键词，会比从空白表单开始更直观。'
                  : 'Start from a template, then adjust folders and keywords instead of filling a blank form.'}
              </span>
            </div>
            <label className={pageStyles.toggleRow}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>{language === 'zh-CN' ? '启用规则' : 'Rule Enabled'}</span>
            </label>
          </div>

          <div className={pageStyles.templateGrid}>
            {ruleTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={pageStyles.templateCard}
                onClick={() => applyTemplate(template)}
              >
                <strong>{template.title[language]}</strong>
                <span>{template.description[language]}</span>
              </button>
            ))}
          </div>

          <div className={pageStyles.formSummaryGrid}>
            <div className={pageStyles.infoCard}>
              <strong>{language === 'zh-CN' ? '目标项目' : 'Target Project'}</strong>
              <span>
                {projects.find((project) => project.id === form.targetProjectId)?.name ??
                  (language === 'zh-CN' ? '未选择' : 'Not selected')}
              </span>
            </div>
            <div className={pageStyles.infoCard}>
              <strong>{language === 'zh-CN' ? '目标目录' : 'Target Folder'}</strong>
              <span>
                {availableFolders.find((folder) => folder.id === form.targetFolderId)?.relativePath ||
                  (language === 'zh-CN' ? '未选择' : 'Not selected')}
              </span>
            </div>
            <div className={pageStyles.infoCard}>
              <strong>{language === 'zh-CN' ? '置信度' : 'Confidence'}</strong>
              <span>{Math.round(Number(form.confidence) * 100)}%</span>
            </div>
          </div>

          <form className={pageStyles.form} onSubmit={handleSubmit}>
            <div className={pageStyles.formSection}>
              <div className={pageStyles.formSectionHeader}>
                <strong>{language === 'zh-CN' ? '基础信息' : 'Basics'}</strong>
                <span className={pageStyles.mutedText}>
                  {language === 'zh-CN'
                    ? '先定义规则名称与目标落点。'
                    : 'Name the rule and define where matched files should land.'}
                </span>
              </div>

              <label className={pageStyles.field}>
                <span>{language === 'zh-CN' ? '规则名称' : 'Rule Name'}</span>
                <input
                  value={form.name}
                  placeholder={language === 'zh-CN' ? '例如：渲染图自动归档' : 'For example: Final render routing'}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  <span>{t(language, 'targetProject')}</span>
                  <select
                    value={form.targetProjectId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        targetProjectId: event.target.value,
                        targetFolderId: folders.find((folder) => folder.projectId === event.target.value)?.id ?? '',
                      }))
                    }
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={pageStyles.field}>
                  <span>{t(language, 'targetRealFolder')}</span>
                  <select
                    value={form.targetFolderId ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, targetFolderId: event.target.value }))}
                  >
                    {availableFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.relativePath || '/'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className={pageStyles.formSection}>
              <div className={pageStyles.formSectionHeader}>
                <strong>{language === 'zh-CN' ? '触发条件' : 'Triggers'}</strong>
                <span className={pageStyles.mutedText}>
                  {language === 'zh-CN'
                    ? '关键词和格式共同决定规则命中。'
                    : 'Keywords and formats work together to match files.'}
                </span>
              </div>

              <label className={pageStyles.field}>
                <span>{t(language, 'keywords')}</span>
                <textarea
                  rows={3}
                  placeholder={
                    language === 'zh-CN'
                      ? '例如：render, final, 成品, 汇报'
                      : 'For example: render, final, board, deliver'
                  }
                  value={form.keywordsText}
                  onChange={(event) => setForm((current) => ({ ...current, keywordsText: event.target.value }))}
                />
              </label>

              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  <span>{t(language, 'formats')}</span>
                  <input
                    placeholder={language === 'zh-CN' ? '例如：png, jpg, pdf' : 'For example: png, jpg, pdf'}
                    value={form.formatsText}
                    onChange={(event) => setForm((current) => ({ ...current, formatsText: event.target.value }))}
                  />
                </label>
                <label className={pageStyles.field}>
                  <span>{t(language, 'confidence')}</span>
                  <input
                    type="number"
                    min="0.55"
                    max="0.99"
                    step="0.01"
                    value={form.confidence}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, confidence: Number(event.target.value || current.confidence) }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className={pageStyles.formSection}>
              <div className={pageStyles.formSectionHeader}>
                <strong>{language === 'zh-CN' ? '输出建议' : 'Output'}</strong>
                <span className={pageStyles.mutedText}>
                  {language === 'zh-CN'
                    ? '给命中的文件补充标签和备注。'
                    : 'Add suggested tags and notes for matched files.'}
                </span>
              </div>

              <label className={pageStyles.field}>
                <span>{t(language, 'tags')}</span>
                <input
                  placeholder={language === 'zh-CN' ? '例如：最终版, 输出, 评图' : 'For example: final, output, review'}
                  value={form.suggestedTagsText}
                  onChange={(event) => setForm((current) => ({ ...current, suggestedTagsText: event.target.value }))}
                />
              </label>

              <label className={pageStyles.field}>
                <span>{t(language, 'note')}</span>
                <textarea
                  rows={3}
                  placeholder={
                    language === 'zh-CN'
                      ? '例如：命中后优先归入 Final 目录，便于最后交付。'
                      : 'For example: Route matched files into Final for easier delivery.'
                  }
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
            </div>

            <div className={pageStyles.actions}>
              <button type="submit" className={pageStyles.primaryButton}>
                {t(language, 'save')}
              </button>
              {form.id ? (
                <button
                  type="button"
                  className={pageStyles.secondaryButton}
                  onClick={async () => {
                    await removeRule(form.id)
                    setSelectedRuleId(null)
                    handleFill(null)
                  }}
                >
                  {t(language, 'deleteRule')}
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
