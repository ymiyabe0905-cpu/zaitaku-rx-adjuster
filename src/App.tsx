import { useState } from 'react';
import { CHANGELOG } from './lib/changelog';
import EndDateTab from './components/tabs/EndDateTab';
import RequiredDaysTab from './components/tabs/RequiredDaysTab';
import ResidualTab from './components/tabs/ResidualTab';
import TotalTab from './components/tabs/TotalTab';
import FixedPatternTab from './components/tabs/FixedPatternTab';
import InsulinTab from './components/tabs/InsulinTab';
import InhalerTab from './components/tabs/InhalerTab';
import EyedropTab from './components/tabs/EyedropTab';
import MorphineInfusionTab from './components/tabs/MorphineInfusionTab';

interface TabDef {
  key: string;
  label: string;
  icon: string;
  render: () => JSX.Element;
}

const TABS: TabDef[] = [
  { key: 'enddate', label: '日数→終了日', icon: '▶', render: () => <EndDateTab /> },
  { key: 'reqdays', label: '終了日→必要日数', icon: '◀', render: () => <RequiredDaysTab /> },
  { key: 'residual', label: '残薬調整', icon: '◆', render: () => <ResidualTab /> },
  { key: 'total', label: '追加薬あわせ', icon: '★', render: () => <TotalTab /> },
  { key: 'fixed', label: '固定パターン', icon: '◆', render: () => <FixedPatternTab /> },
  { key: 'insulin', label: 'インスリン残数', icon: '🪙', render: () => <InsulinTab /> },
  { key: 'inhaler', label: '吸入薬残数', icon: '◆', render: () => <InhalerTab /> },
  { key: 'eyedrop', label: '点眼薬残数', icon: '◆', render: () => <EyedropTab /> },
  { key: 'morphine', label: 'モルヒネ持続投与', icon: '💧', render: () => <MorphineInfusionTab /> },
];

export default function App() {
  const [active, setActive] = useState('enddate');
  const [showLog, setShowLog] = useState(false);
  const tab = TABS.find((t) => t.key === active)!;

  return (
    <div className="app">
      {/* 背景の雲（ドット絵風・著作物の再現はしない） */}
      <div className="sky-deco" aria-hidden>
        <span className="cloud cloud-1" />
        <span className="cloud cloud-2" />
        <span className="cloud cloud-3" />
      </div>

      {/* 右上：変更ログボタン */}
      <button className="log-btn" onClick={() => setShowLog(true)}>
        📜 変更ログ
      </button>
      {showLog && <ChangelogModal onClose={() => setShowLog(false)} />}

      <header className="app-header">
        <h1 className="title">
          <span className="title-block">処</span>
          <span className="title-block">方</span>
          <span className="title-block">日</span>
          <span className="title-block">数</span>
          <span className="title-gap" />
          <span className="title-text">アジャスター</span>
        </h1>
        <p className="subtitle">処方日数・残薬調整サポート（試作版 v0.1）</p>
      </header>

      {/* 注意書き（常時表示） */}
      <div className="notice" role="alert">
        ⚠ この計算結果は確認用です。最終判断は医師・薬剤師が行ってください。
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${active === t.key ? ' tab--active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">{tab.render()}</main>

      <footer className="app-footer">
        <span className="ground-tile" aria-hidden />
        処方日数アジャスター — フロントのみで動作（サーバー・ログイン不要）／日付計算はローカルJSで実行
      </footer>
    </div>
  );
}

/** 変更ログのモーダル表示 */
function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>📜 変更ログ</span>
          <button className="modal-close" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {CHANGELOG.map((entry) => (
            <div className="log-entry" key={entry.version}>
              <h3 className="log-version">
                {entry.version}　<span className="log-label">{entry.label}</span>
                <span className="log-date">{entry.date}</span>
              </h3>
              {entry.sections.map((sec) => (
                <div className="log-section" key={sec.title}>
                  <div className="log-section-title">◆ {sec.title}</div>
                  <ul className="log-list">
                    {sec.items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
