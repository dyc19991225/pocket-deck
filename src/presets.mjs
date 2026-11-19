export const DEFAULT_MACROS = [
  { id: 'mute', icon: '🔇', label: '静音切换', sub: 'CoreAudio Mute', color: '#ef4444', actionType: 'audio_mute', value: '' },
  { id: 'vol_down', icon: '🔉', label: '音量 -8%', sub: 'Volume -8%', color: '#38bdf8', actionType: 'audio_step', value: '-8' },
  { id: 'vol_up', icon: '🔊', label: '音量 +8%', sub: 'Volume +8%', color: '#38bdf8', actionType: 'audio_step', value: '8' },
  { id: 'play_pause', icon: '⏯️', label: '播放 / 暂停', sub: 'Media Play/Pause', color: '#22c55e', actionType: 'vk', value: 'media_play_pause' },
  { id: 'next_track', icon: '⏭️', label: '切下一首', sub: 'Next Track', color: '#a855f7', actionType: 'vk', value: 'media_next' },

  { id: 'screenshot', icon: '📸', label: '全屏截屏预览', sub: '弹窗直看 + 秒存', color: '#f59e0b', actionType: 'screenshot', value: '' },
  { id: 'snipping', icon: '✂️', label: '区域框选截图', sub: 'Win + Shift + S', color: '#fb923c', actionType: 'snipping_tool', value: '' },
  { id: 'pull_clip', icon: '📋', label: '提取电脑剪贴板', sub: '一键拉取复制', color: '#14b8a6', actionType: 'pull_clipboard', value: '' },
  { id: 'boss_key', icon: '🧹', label: '老板键回桌面', sub: '切换显示桌面', color: '#06b6d4', actionType: 'show_desktop', value: '' },
  { id: 'open_term', icon: '💻', label: '打开终端', sub: 'Windows Terminal', color: '#6366f1', actionType: 'open_app', value: 'terminal' },

  { id: 'open_ws', icon: '📂', label: '打开工作区', sub: '快速打开主目录', color: '#eab308', actionType: 'open_app', value: 'explorer_workspace' },
  { id: 'calc', icon: '🧮', label: '科学计算器', sub: 'Calculator', color: '#10b981', actionType: 'open_app', value: 'calc' },
  { id: 'sound_cfg', icon: '⚙️', label: '声音输出切换', sub: '耳机/音响设置', color: '#0ea5e9', actionType: 'open_app', value: 'sound_settings' },
  { id: 'task_mgr', icon: '📊', label: '任务管理器', sub: 'Task Manager', color: '#ec4899', actionType: 'open_app', value: 'taskmgr' },
  { id: 'lock_pc', icon: '🔒', label: '一键锁屏', sub: '双击防误触', color: '#64748b', actionType: 'lock_pc', value: '', confirmRequired: true },
];

export const JIANYING_MACROS = [
  { id: 'jy_split', icon: '✂️', label: '分割素材', sub: 'Ctrl + B', color: '#f43f5e', actionType: 'hotkey', value: 'ctrl+b' },
  { id: 'jy_ripple_l', icon: '⬅️', label: '删前段气口', sub: 'Q 波纹左删', color: '#fb923c', actionType: 'hotkey', value: 'q' },
  { id: 'jy_ripple_r', icon: '➡️', label: '删后段废话', sub: 'W 波纹右删', color: '#fb923c', actionType: 'hotkey', value: 'w' },
  { id: 'jy_play', icon: '⏯️', label: '预览 / 暂停', sub: 'Space 空格', color: '#22c55e', actionType: 'hotkey', value: 'space' },
  { id: 'jy_del', icon: '🗑️', label: '删除选中段', sub: 'Delete 删除', color: '#ef4444', actionType: 'hotkey', value: 'delete' },

  { id: 'jy_undo', icon: '↩️', label: '撤销一步', sub: 'Ctrl + Z', color: '#38bdf8', actionType: 'hotkey', value: 'ctrl+z' },
  { id: 'jy_redo', icon: '↪️', label: '重做恢复', sub: 'Ctrl + Shift + Z', color: '#0ea5e9', actionType: 'hotkey', value: 'ctrl+shift+z' },
  { id: 'jy_mark', icon: '🚩', label: '打节奏标记', sub: 'M 关键点标记', color: '#eab308', actionType: 'hotkey', value: 'm' },
  { id: 'jy_snap', icon: '🧲', label: '磁吸对齐开关', sub: 'N 自动吸附', color: '#a855f7', actionType: 'hotkey', value: 'n' },
  { id: 'jy_select', icon: '🖱️', label: '主选择指针', sub: 'A / V 指针模式', color: '#14b8a6', actionType: 'hotkey', value: 'a' },

  { id: 'jy_zoom_in', icon: '🔍', label: '放大时间轴', sub: 'Ctrl + =', color: '#6366f1', actionType: 'hotkey', value: 'ctrl+plus' },
  { id: 'jy_zoom_out', icon: '🔎', label: '缩小时间轴', sub: 'Ctrl + -', color: '#6366f1', actionType: 'hotkey', value: 'ctrl+minus' },
  { id: 'jy_group', icon: '🧩', label: '新建复合片段', sub: 'Alt + G 打包', color: '#ec4899', actionType: 'hotkey', value: 'alt+g' },
  { id: 'jy_full', icon: '🖥️', label: '全屏预览画面', sub: 'Ctrl + Shift + F', color: '#06b6d4', actionType: 'hotkey', value: 'ctrl+shift+f' },
  { id: 'jy_export', icon: '🚀', label: '一键导出成片', sub: 'Ctrl + E 渲染', color: '#10b981', actionType: 'hotkey', value: 'ctrl+e' },
];

export const STREAMER_MACROS = [
  { id: 'st_rec', icon: '🔴', label: '系统录屏开关', sub: 'Win + Alt + R', color: '#ef4444', actionType: 'hotkey', value: 'win+alt+r' },
  { id: 'st_clip30', icon: '⏪', label: '抓拍前30秒高光', sub: 'Win + Alt + G', color: '#f59e0b', actionType: 'hotkey', value: 'win+alt+g' },
  { id: 'st_mic', icon: '🎙️', label: '闭麦 / 开麦', sub: 'Win + Alt + M', color: '#ec4899', actionType: 'hotkey', value: 'win+alt+m' },
  { id: 'st_scene1', icon: '🎥', label: '主机位场景 1', sub: 'Ctrl + Shift + F1', color: '#38bdf8', actionType: 'hotkey', value: 'ctrl+shift+f1' },
  { id: 'st_scene2', icon: '🖼️', label: '共享桌面场景 2', sub: 'Ctrl + Shift + F2', color: '#a855f7', actionType: 'hotkey', value: 'ctrl+shift+f2' },

  { id: 'st_scene3', icon: '⏳', label: '中场休息画面 3', sub: 'Ctrl + Shift + F3', color: '#6366f1', actionType: 'hotkey', value: 'ctrl+shift+f3' },
  { id: 'mute', icon: '🔇', label: '桌面伴奏静音', sub: 'CoreAudio Mute', color: '#f43f5e', actionType: 'audio_mute', value: '' },
  { id: 'vol_down', icon: '🔉', label: '伴奏音量 -8%', sub: 'Volume -8%', color: '#0ea5e9', actionType: 'audio_step', value: '-8' },
  { id: 'vol_up', icon: '🔊', label: '伴奏音量 +8%', sub: 'Volume +8%', color: '#0ea5e9', actionType: 'audio_step', value: '8' },
  { id: 'play_pause', icon: '🎵', label: 'BGM 播放/暂停', sub: 'Media Play', color: '#22c55e', actionType: 'vk', value: 'media_play_pause' },

  { id: 'screenshot', icon: '📸', label: '直播高光截屏', sub: '弹窗直看 + 秒存', color: '#eab308', actionType: 'screenshot', value: '' },
  { id: 'st_sound', icon: '🎚️', label: '音频通道设置', sub: '声卡/监听切换', color: '#14b8a6', actionType: 'open_app', value: 'sound_settings' },
  { id: 'st_bili', icon: '📺', label: 'B站直播后台', sub: '打开开播中心', color: '#fb7185', actionType: 'open_url', value: 'https://link.bilibili.com/p/center/index' },
  { id: 'st_dy', icon: '🎶', label: '抖音创作者服务', sub: '数据大屏后台', color: '#06b6d4', actionType: 'open_url', value: 'https://creator.douyin.com/' },
  { id: 'boss_key', icon: '🛡️', label: '隐私防漏秒切桌面', sub: 'Win + D 隐藏窗口', color: '#64748b', actionType: 'show_desktop', value: '' },
];

export const OFFICE_MACROS = [
  { id: 'of_boss', icon: '🐟', label: '极速摸鱼老板键', sub: '一键收起回桌面', color: '#06b6d4', actionType: 'show_desktop', value: '' },
  { id: 'of_switch', icon: '🔄', label: '秒切上个工作窗', sub: 'Alt + Tab', color: '#38bdf8', actionType: 'hotkey', value: 'alt+tab' },
  { id: 'of_vdesk_r', icon: '🆕', label: '切第二虚拟桌面', sub: 'Ctrl + Win + →', color: '#6366f1', actionType: 'hotkey', value: 'ctrl+win+right' },
  { id: 'of_vdesk_l', icon: '🔙', label: '切回第一主桌面', sub: 'Ctrl + Win + ←', color: '#8b5cf6', actionType: 'hotkey', value: 'ctrl+win+left' },
  { id: 'of_wechat', icon: '💬', label: '唤起/隐藏微信', sub: 'Ctrl + Alt + W', color: '#22c55e', actionType: 'hotkey', value: 'ctrl+alt+w' },

  { id: 'snipping', icon: '✂️', label: '区域框选截图', sub: 'Win + Shift + S', color: '#fb923c', actionType: 'snipping_tool', value: '' },
  { id: 'pull_clip', icon: '📋', label: '提取电脑剪贴板', sub: '跨端复制提取', color: '#14b8a6', actionType: 'pull_clipboard', value: '' },
  { id: 'of_paste_txt', icon: '📄', label: '无格式纯文本粘贴', sub: 'Ctrl + Shift + V', color: '#10b981', actionType: 'hotkey', value: 'ctrl+shift+v' },
  { id: 'of_clip_hist', icon: '🗂️', label: '系统剪贴板历史', sub: 'Win + V 历史记录', color: '#eab308', actionType: 'hotkey', value: 'win+v' },
  { id: 'of_emoji', icon: '😀', label: '系统表情面板', sub: 'Win + . 快速发表情', color: '#f59e0b', actionType: 'hotkey', value: 'win+period' },

  { id: 'mute', icon: '🔇', label: '会议紧急静音', sub: 'CoreAudio Mute', color: '#ef4444', actionType: 'audio_mute', value: '' },
  { id: 'calc', icon: '🧮', label: '财务计算器', sub: 'Calculator', color: '#0ea5e9', actionType: 'open_app', value: 'calc' },
  { id: 'of_search', icon: '🔍', label: '全局搜索文件', sub: 'Win + S 搜索', color: '#a855f7', actionType: 'hotkey', value: 'win+s' },
  { id: 'task_mgr', icon: '📊', label: '卡死进程清理', sub: 'Task Manager', color: '#ec4899', actionType: 'open_app', value: 'taskmgr' },
  { id: 'lock_pc', icon: '🔒', label: '下班离座锁屏', sub: '双击防误触', color: '#64748b', actionType: 'lock_pc', value: '', confirmRequired: true },
];

export const DECK_PROFILES = [
  {
    id: 'standard',
    name: '🎛️ 全能桌搭台',
    badge: '免费',
    proOnly: false,
    desc: '音量推子 · 截屏快传 · 常用系统控台',
    defaults: DEFAULT_MACROS,
  },
  {
    id: 'jianying',
    name: '🎬 剪映 / PR 剪辑台',
    badge: 'PRO',
    proOnly: true,
    desc: '无视中文输入法干扰 · 一键分割/删气口/打标/导出',
    defaults: JIANYING_MACROS,
  },
  {
    id: 'streamer',
    name: '🎙️ 直播 / 录屏导播台',
    badge: 'PRO',
    proOnly: true,
    desc: '一键录屏抓高光 · 闭麦控音 · 多场景机位秒切',
    defaults: STREAMER_MACROS,
  },
  {
    id: 'office',
    name: '🐟 办公提效 & 摸鱼台',
    badge: 'PRO',
    proOnly: true,
    desc: '双虚拟桌面隐身 · 秒唤微信 · 纯文本粘贴与锁屏',
    defaults: OFFICE_MACROS,
  },
];

export const DECK_THEMES = [
  { id: 'cyber_blue', name: '🌌 深空赛博蓝', proOnly: false, accent: '#38bdf8' },
  { id: 'eva_purple', name: '👾 初号机霓虹紫', proOnly: true, accent: '#a855f7' },
  { id: 'sunset_gold', name: '🔥 黑金客制化暖光', proOnly: true, accent: '#f59e0b' },
  { id: 'matrix_green', name: '💻 黑客终端荧光绿', proOnly: true, accent: '#22c55e' },
];
