import { useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { openExternalTarget } from '../adapters/desktopBridge'
import { SectionHeader } from '../components/common/SectionHeader'
import { importModeLabel, t } from '../i18n/translate'
import { useAssetConsoleStore } from '../store/useAssetConsoleStore'
import type { AppTheme, ImportMode, SupportedLanguage } from '../types/domain'
import pageStyles from './Page.module.css'

const languages: SupportedLanguage[] = ['zh-CN', 'en-US']
const importModes: ImportMode[] = ['auto', 'manual', 'current_project']
const themes: AppTheme[] = ['system', 'light', 'dark']
const supportLink = 'https://inv06.lmaff01.cc/register?aff=g3M2RAOE'

function languageLabel(option: SupportedLanguage) {
  return option === 'zh-CN' ? '简体中文' : 'English'
}

function themeLabel(language: SupportedLanguage, theme: AppTheme) {
  if (language === 'zh-CN') {
    switch (theme) {
      case 'system':
        return '跟随系统'
      case 'light':
        return '浅色'
      case 'dark':
        return '深色'
    }
  }

  switch (theme) {
    case 'system':
      return 'Follow System'
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
  }
}

function themeDescription(language: SupportedLanguage, theme: AppTheme) {
  if (language === 'zh-CN') {
    switch (theme) {
      case 'system':
        return '自动跟随系统浅色或深色模式。'
      case 'light':
        return '始终使用浅色界面。'
      case 'dark':
        return '始终使用深色界面。'
    }
  }

  switch (theme) {
    case 'system':
      return 'Automatically follows the system light or dark mode.'
    case 'light':
      return 'Always use the light appearance.'
    case 'dark':
      return 'Always use the dark appearance.'
  }
}

function QrCard({
  src,
  alt,
  title,
  fallback,
}: {
  src: string
  alt: string
  title: string
  fallback: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={pageStyles.qrCard}>
      <strong>{title}</strong>
      {failed ? (
        <div className={pageStyles.qrFallback}>
          <span>{fallback}</span>
          <small>{src}</small>
        </div>
      ) : (
        <img className={pageStyles.qrImage} src={src} alt={alt} onError={() => setFailed(true)} />
      )}
    </div>
  )
}

function SupportCard({
  title,
  children,
  defaultCollapsed = true,
}: {
  title: string
  children: ReactNode
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <article className={pageStyles.supportCard}>
      <div className={pageStyles.supportCardHeader}>
        <strong>{title}</strong>
        <button
          type="button"
          className={pageStyles.secondaryButton}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
      {!collapsed ? <div className={pageStyles.supportCardBody}>{children}</div> : null}
    </article>
  )
}

export function SettingsPage() {
  const {
    settings,
    updateSettings,
    lanPanelStatus,
    lanPanelLoading,
    refreshLanPanelStatus,
    pickLanPanelWorkspace,
    startLanPanelServer,
    stopLanPanelServer,
    regenerateLanPanelCode,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
      lanPanelStatus: state.lanPanelStatus,
      lanPanelLoading: state.lanPanelLoading,
      refreshLanPanelStatus: state.refreshLanPanelStatus,
      pickLanPanelWorkspace: state.pickLanPanelWorkspace,
      startLanPanelServer: state.startLanPanelServer,
      stopLanPanelServer: state.stopLanPanelServer,
      regenerateLanPanelCode: state.regenerateLanPanelCode,
    })),
  )

  const language = settings.language

  return (
    <div className={`${pageStyles.page} ${pageStyles.pageStatic}`}>
      <SectionHeader
        eyebrow={language === 'zh-CN' ? '设置' : t(language, 'settingsEyebrow')}
        title={language === 'zh-CN' ? '偏好设置' : 'Preferences'}
        description={
          language === 'zh-CN'
            ? '统一调整语言、主题和默认导入行为，不改真实项目名、目录名和文件名。'
            : 'Adjust language, theme, and default import behavior without changing real project, folder, or file names.'
        }
        compact
      />

      <div className={pageStyles.statusRow}>
        <span className={pageStyles.statusBadgeActive}>
          {language === 'zh-CN' ? '当前主题' : 'Theme'} {themeLabel(language, settings.theme)}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {t(language, 'language')} {languageLabel(settings.language)}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {t(language, 'defaultImportMode')} {importModeLabel(language, settings.defaultImportMode)}
        </span>
      </div>

      <div className={pageStyles.preferenceGrid}>
        <section className={`${pageStyles.panel} ${pageStyles.panelStrong}`}>
          <div className={pageStyles.editorHeader}>
            <div className={pageStyles.editorHeaderCopy}>
              <p className={pageStyles.eyebrowCompact}>{language === 'zh-CN' ? '界面' : 'Interface'}</p>
              <h2>{language === 'zh-CN' ? '显示与语言' : 'Display & Language'}</h2>
              <span className={pageStyles.mutedText}>
                {language === 'zh-CN'
                  ? '只切换 UI 文案和主题外观，不改你的真实文件内容。'
                  : 'Only UI copy and appearance change. Real file content stays untouched.'}
              </span>
            </div>
          </div>

          <div className={pageStyles.formSummaryGrid}>
            <div className={pageStyles.infoCard}>
              <strong>{t(language, 'language')}</strong>
              <span>{languageLabel(settings.language)}</span>
            </div>
            <div className={pageStyles.infoCard}>
              <strong>{language === 'zh-CN' ? '主题模式' : 'Theme Mode'}</strong>
              <span>{themeLabel(language, settings.theme)}</span>
            </div>
            <div className={pageStyles.infoCard}>
              <strong>{language === 'zh-CN' ? '主题说明' : 'Theme Strategy'}</strong>
              <span>{themeDescription(language, settings.theme)}</span>
            </div>
          </div>

          <div className={pageStyles.form}>
            <div className={pageStyles.formSection}>
              <div className={pageStyles.formSectionHeader}>
                <strong>{language === 'zh-CN' ? '语言' : 'Language'}</strong>
                <span className={pageStyles.mutedText}>
                  {language === 'zh-CN'
                    ? '只切换界面文案，不会改动项目名、目录名和文件名。'
                    : 'Only the UI copy changes. Project, folder, and file names remain unchanged.'}
                </span>
              </div>

              <label className={pageStyles.field}>
                <span>{t(language, 'language')}</span>
                <select
                  value={settings.language}
                  onChange={(event) => void updateSettings({ language: event.target.value as SupportedLanguage })}
                >
                  {languages.map((option) => (
                    <option key={option} value={option}>
                      {languageLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={pageStyles.formSection}>
              <div className={pageStyles.formSectionHeader}>
                <strong>{language === 'zh-CN' ? '主题' : 'Theme'}</strong>
                <span className={pageStyles.mutedText}>{themeDescription(language, settings.theme)}</span>
              </div>

              <label className={pageStyles.field}>
                <span>{language === 'zh-CN' ? '主题模式' : 'Theme Mode'}</span>
                <select
                  value={settings.theme}
                  onChange={(event) => void updateSettings({ theme: event.target.value as AppTheme })}
                >
                  {themes.map((theme) => (
                    <option key={theme} value={theme}>
                      {themeLabel(language, theme)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className={`${pageStyles.panel} ${pageStyles.panelMuted}`}>
          <div className={pageStyles.editorHeader}>
            <div className={pageStyles.editorHeaderCopy}>
              <p className={pageStyles.eyebrowCompact}>{language === 'zh-CN' ? '导入' : 'Import'}</p>
              <h2>{language === 'zh-CN' ? '默认导入行为' : 'Default Import Behavior'}</h2>
              <span className={pageStyles.mutedText}>
                {language === 'zh-CN'
                  ? '控制全局导入和项目内导入的默认落点逻辑。'
                  : 'Control the default routing mode for both global and in-project imports.'}
              </span>
            </div>
          </div>

          <div className={pageStyles.formSummaryGrid}>
            <div className={pageStyles.infoCard}>
              <strong>{t(language, 'defaultImportMode')}</strong>
              <span>{importModeLabel(language, settings.defaultImportMode)}</span>
            </div>
            <div className={pageStyles.infoCard}>
              <strong>{language === 'zh-CN' ? '推荐场景' : 'Recommended Scenario'}</strong>
              <span>
                {language === 'zh-CN'
                  ? '项目页推荐“当前项目”，总览页推荐“手动分配”。'
                  : 'Use current-project mode inside project pages and manual mode on overview pages.'}
              </span>
            </div>
            <div className={pageStyles.infoCard}>
              <strong>{language === 'zh-CN' ? '适用范围' : 'Scope'}</strong>
              <span>
                {language === 'zh-CN'
                  ? '仅影响默认行为，不影响单次手动调整。'
                  : 'Only affects the default behavior, not one-off manual edits.'}
              </span>
            </div>
          </div>

          <div className={pageStyles.form}>
            <div className={pageStyles.formSection}>
              <div className={pageStyles.formSectionHeader}>
                <strong>{language === 'zh-CN' ? '导入模式' : 'Import Mode'}</strong>
                <span className={pageStyles.mutedText}>
                  {language === 'zh-CN'
                    ? '自动分配、手动分配和当前项目模式都可以随时切换。'
                    : 'You can switch between auto, manual, and current-project modes at any time.'}
                </span>
              </div>

              <label className={pageStyles.field}>
                <span>{t(language, 'defaultImportMode')}</span>
                <select
                  value={settings.defaultImportMode}
                  onChange={(event) => void updateSettings({ defaultImportMode: event.target.value as ImportMode })}
                >
                  {importModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {importModeLabel(language, mode)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>
      </div>

      <section className={`${pageStyles.panel} ${pageStyles.panelStrong}`}>
        <div className={pageStyles.editorHeader}>
          <div className={pageStyles.editorHeaderCopy}>
            <p className={pageStyles.eyebrowCompact}>{language === 'zh-CN' ? '局域网面板' : 'LAN Panel'}</p>
            <h2>{language === 'zh-CN' ? '手机端局域网服务' : 'Mobile LAN Service'}</h2>
            <span className={pageStyles.mutedText}>
              {language === 'zh-CN'
                ? '手机和电脑处于同一 Wi-Fi 时，可通过连接码在手机浏览器中访问文件面板。'
                : 'When the phone and desktop share the same Wi-Fi, the mobile file panel can be opened in a phone browser with the one-time code.'}
            </span>
          </div>
        </div>

        <div className={pageStyles.statusRow}>
          <span className={lanPanelStatus.serverEnabled ? pageStyles.statusBadgeActive : pageStyles.statusBadgeMuted}>
            {language === 'zh-CN'
              ? lanPanelStatus.serverEnabled
                ? '服务运行中'
                : '服务未启动'
              : lanPanelStatus.serverEnabled
                ? 'Service Running'
                : 'Service Stopped'}
          </span>
          <span className={lanPanelStatus.workspaceSelected ? pageStyles.statusBadgeActive : pageStyles.statusBadgeMuted}>
            {language === 'zh-CN'
              ? lanPanelStatus.workspaceSelected
                ? '工作目录已选择'
                : '未选择工作目录'
              : lanPanelStatus.workspaceSelected
                ? 'Workspace Selected'
                : 'No Workspace'}
          </span>
          <span className={pageStyles.statusBadgeMuted}>
            {language === 'zh-CN' ? '认证模式' : 'Auth'}{' '}
            {lanPanelStatus.authMode === 'one_time_code'
              ? language === 'zh-CN'
                ? '一次性连接码'
                : 'One-time code'
              : lanPanelStatus.authMode}
          </span>
          {lanPanelLoading ? (
            <span className={pageStyles.statusBadgeMuted}>
              {language === 'zh-CN' ? '处理中...' : 'Working...'}
            </span>
          ) : null}
        </div>

        <div className={pageStyles.formSummaryGrid}>
          <div className={pageStyles.infoCard}>
            <strong>{language === 'zh-CN' ? '工作目录' : 'Workspace'}</strong>
            <span>{lanPanelStatus.workspaceName ?? (language === 'zh-CN' ? '未选择' : 'Not selected')}</span>
          </div>
          <div className={pageStyles.infoCard}>
            <strong>{language === 'zh-CN' ? '连接码' : 'Access Code'}</strong>
            <span>{lanPanelStatus.accessCode ?? (language === 'zh-CN' ? '未生成' : 'Not generated')}</span>
          </div>
          <div className={pageStyles.infoCard}>
            <strong>{language === 'zh-CN' ? '端口' : 'Port'}</strong>
            <span>{lanPanelStatus.port ?? (language === 'zh-CN' ? '未监听' : 'Not listening')}</span>
          </div>
          <div className={pageStyles.infoCard}>
            <strong>{language === 'zh-CN' ? '设备数' : 'Devices'}</strong>
            <span>{lanPanelStatus.devices.length}</span>
          </div>
        </div>

        <div className={pageStyles.actions}>
          <button type="button" className={pageStyles.secondaryButton} onClick={() => void pickLanPanelWorkspace()}>
            {language === 'zh-CN' ? '选择工作目录' : 'Select Workspace'}
          </button>
          <button
            type="button"
            className={pageStyles.primaryButton}
            disabled={!lanPanelStatus.workspaceSelected || lanPanelStatus.serverEnabled || lanPanelLoading}
            onClick={() => void startLanPanelServer()}
          >
            {language === 'zh-CN' ? '启动服务' : 'Start Service'}
          </button>
          <button
            type="button"
            className={pageStyles.secondaryButton}
            disabled={!lanPanelStatus.serverEnabled || lanPanelLoading}
            onClick={() => void stopLanPanelServer()}
          >
            {language === 'zh-CN' ? '停止服务' : 'Stop Service'}
          </button>
          <button type="button" className={pageStyles.secondaryButton} onClick={() => void regenerateLanPanelCode()}>
            {language === 'zh-CN' ? '刷新连接码' : 'Regenerate Code'}
          </button>
          <button type="button" className={pageStyles.secondaryButton} onClick={() => void refreshLanPanelStatus()}>
            {language === 'zh-CN' ? '刷新状态' : 'Refresh Status'}
          </button>
        </div>

        <div className={pageStyles.preferenceGrid}>
          <section className={pageStyles.panel}>
            <div className={pageStyles.summaryMetaRow}>
              <strong>{language === 'zh-CN' ? '访问地址' : 'Access Addresses'}</strong>
              <span className={pageStyles.mutedText}>
                {language === 'zh-CN' ? '手机和电脑需处于同一 Wi-Fi。' : 'Phone and desktop must share the same Wi-Fi.'}
              </span>
            </div>
            <div className={pageStyles.list}>
              {lanPanelStatus.addresses.length > 0 ? (
                lanPanelStatus.addresses.map((address) => (
                  <div key={address} className={pageStyles.listItem}>
                    <div>
                      <strong>{address}</strong>
                      <span>
                        {language === 'zh-CN'
                          ? '手机浏览器打开此地址后，输入连接码即可进入文件面板。'
                          : 'Open this address in a phone browser, then enter the one-time code to access the file panel.'}
                      </span>
                    </div>
                    <div className={pageStyles.actions}>
                      <button
                        type="button"
                        className={pageStyles.secondaryButton}
                        onClick={() => void openExternalTarget(address)}
                      >
                        {language === 'zh-CN' ? '打开' : 'Open'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className={pageStyles.mutedText}>
                  {language === 'zh-CN'
                    ? '服务启动后，这里会显示局域网访问地址。'
                    : 'LAN access addresses appear here after the service starts.'}
                </p>
              )}
            </div>
            <div className={pageStyles.fieldHint}>
              {lanPanelStatus.workspacePath ?? (language === 'zh-CN' ? '尚未选择工作目录。' : 'No workspace selected yet.')}
            </div>
          </section>

          <section className={pageStyles.panel}>
            <div className={pageStyles.summaryMetaRow}>
              <strong>{language === 'zh-CN' ? '当前连接设备' : 'Connected Devices'}</strong>
              <span className={pageStyles.mutedText}>
                {language === 'zh-CN'
                  ? '手机浏览器打开文件面板后，设备会显示在这里。'
                  : 'Devices appear here after the mobile file panel is opened in a phone browser.'}
              </span>
            </div>
            <div className={pageStyles.scrollArea}>
              <div className={pageStyles.list}>
                {lanPanelStatus.devices.length > 0 ? (
                  lanPanelStatus.devices.map((device) => (
                    <div key={device.id} className={pageStyles.listItem}>
                      <div>
                        <strong>{device.label}</strong>
                        <span>{device.ip}</span>
                        <span>
                          {language === 'zh-CN' ? '最近活动：' : 'Last seen: '}
                          {device.lastSeenAt}
                        </span>
                      </div>
                      <div className={pageStyles.actions}>
                        <span className={device.online ? pageStyles.statusBadgeActive : pageStyles.statusBadgeMuted}>
                          {device.online
                            ? language === 'zh-CN'
                              ? '在线'
                              : 'Online'
                            : language === 'zh-CN'
                              ? '离线'
                              : 'Offline'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={pageStyles.mutedText}>
                    {language === 'zh-CN'
                      ? '暂无访问记录。手机浏览器打开访问地址后，这里会显示设备信息。'
                      : 'No device activity yet. Open an access address on your phone browser to populate this list.'}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className={`${pageStyles.panel} ${pageStyles.panelStrong}`}>
        <div className={pageStyles.editorHeader}>
          <div className={pageStyles.editorHeaderCopy}>
            <p className={pageStyles.eyebrowCompact}>{language === 'zh-CN' ? '支持与联系' : 'Support & Contact'}</p>
            <h2>{language === 'zh-CN' ? '站主相关' : 'Owner Support'}</h2>
            <span className={pageStyles.mutedText}>
              {language === 'zh-CN'
                ? '这里放支持站主、外部链接和联系方式。'
                : 'This area contains support, external links, and contact details.'}
            </span>
          </div>
        </div>

        <div className={pageStyles.supportGrid}>
          <SupportCard title={language === 'zh-CN' ? '支持站主' : 'Support the Owner'}>
            <p>{language === 'zh-CN' ? '如果这个软件对你有帮助，可以支持一下站主。' : 'If this software helps you, you can support the owner here.'}</p>
            <div className={pageStyles.qrGrid}>
              <QrCard
                src="/support/owner-wechat-pay.jpg"
                alt="站主微信收款码"
                title={language === 'zh-CN' ? '微信收款码' : 'WeChat Pay'}
                fallback={language === 'zh-CN' ? '请放入站主微信收款码' : 'Add the owner WeChat Pay QR here'}
              />
              <QrCard
                src="/support/owner-alipay-pay.jpg"
                alt="站主支付宝收款码"
                title={language === 'zh-CN' ? '支付宝收款码' : 'Alipay'}
                fallback={language === 'zh-CN' ? '请放入站主支付宝收款码' : 'Add the owner Alipay QR here'}
              />
            </div>
          </SupportCard>

          <SupportCard title={language === 'zh-CN' ? '魔法上网' : 'Internet Link'}>
            <p>{language === 'zh-CN' ? '支持站主务必填写站主邀请码 g3M2RAOE。' : 'Please use the owner invitation code g3M2RAOE to support the owner.'}</p>
            <button
              type="button"
              className={pageStyles.primaryButton}
              onClick={() => void openExternalTarget(supportLink)}
            >
              {language === 'zh-CN' ? '点击进入' : 'Open Link'}
            </button>
            <span className={pageStyles.mutedText}>{supportLink}</span>
          </SupportCard>

          <SupportCard title={language === 'zh-CN' ? '站主联系方式' : 'Owner Contact'}>
            <p>
              {language === 'zh-CN'
                ? '对网站有什么建议，或者找站主有事儿的，扫描二维码。'
                : 'If you have feedback or need to contact the owner, scan the QR code below.'}
            </p>
            <div className={pageStyles.qrGridSingle}>
              <QrCard
                src="/support/owner-wechat-contact.jpg"
                alt="站主微信二维码"
                title={language === 'zh-CN' ? '微信二维码' : 'WeChat QR'}
                fallback={language === 'zh-CN' ? '请放入站主微信联系二维码' : 'Add the owner WeChat contact QR here'}
              />
            </div>
          </SupportCard>
        </div>
      </section>
    </div>
  )
}
