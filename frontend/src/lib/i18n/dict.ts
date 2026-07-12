export const locales = ["en", "kk", "ru"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export type CategorySlug =
  | "love"
  | "happy_moments"
  | "dreams"
  | "education"
  | "career"
  | "travel"
  | "friendship"
  | "childhood"
  | "achievements"
  | "beautiful_places"
  | "memories"
  | "urban_legends";

interface Dict {
  appName: string;
  loading: string;
  errorGeneric: string;
  errorLocationDenied: string;
  retry: string;
  searchPlaceholder: string;
  menu: string;
  trending: string;
  noResults: string;
  addStory: string;
  tapMapToPlace: string;
  cancel: string;
  newStory: string;
  category: string;
  titleLabel: string;
  titlePlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  dateLabel: string;
  photosLabel: string;
  addPhoto: string;
  pick: string;
  change: string;
  previousMonth: string;
  nextMonth: string;
  locationLabel: string;
  locationApprox: string;
  locationExact: string;
  locationApproxHint: string;
  visibilityLabel: string;
  visibilityPublic: string;
  visibilityPrivate: string;
  postAnonymously: string;
  publish: string;
  publishing: string;
  done: string;
  anonymous: string;
  comments: string;
  commentPlaceholder: string;
  send: string;
  noCommentsYet: string;
  share: string;
  linkCopied: string;
  report: string;
  reported: string;
  deleteStory: string;
  deleteComment: string;
  saved: string;
  save: string;
  profile: string;
  myStories: string;
  savedStories: string;
  stats: string;
  storiesCount: string;
  noStoriesYet: string;
  noSavedYet: string;
  addFirstStory: string;
  exploreMap: string;
  openInTelegram: string;
  locateMe: string;
  nearby: string;
  noNearby: string;
  settings: string;
  about: string;
  languageLabel: string;
  themeLabel: string;
  themeAuto: string;
  themeLight: string;
  themeDark: string;
  aboutTagline: string;
  aboutWhat: string;
  aboutWhatBody: string;
  aboutHow: string;
  aboutHowBody: string;
  aboutPrivacy: string;
  aboutPrivacyBody: string;
  aboutTelegram: string;
  aboutTelegramBody: string;
  statusPending: string;
  statusApproved: string;
  statusRejected: string;
  reasonLabel: string;
  pendingHint: string;
  resubmit: string;
  edit: string;
  moderation: string;
  approve: string;
  reject: string;
  rejectReasonPlaceholder: string;
  queueEmpty: string;
  loadMore: string;
  adminOnly: string;
  storySentTitle: string;
  storySentBody: string;
  gotIt: string;
  confirm: string;
  deleting: string;
  confirmDeleteTitle: string;
  confirmDeleteBody: string;
  confirmReportTitle: string;
  confirmReportBody: string;
  adminDashboard: string;
  adminUsers: string;
  adminAuditLogs: string;
  adminSearchUsers: string;
  adminActive: string;
  adminBlocked: string;
  adminDeleted: string;
  adminSortBy: string;
  adminPrevious: string;
  adminNext: string;
  adminNoUsers: string;
  adminBlock: string;
  adminUnblock: string;
  adminWarning: string;
  adminDeleteAccount: string;
  adminRestoreAccount: string;
  adminReasonPlaceholder: string;
  adminReasonRequired: string;
  adminSessions: string;
  adminHistory: string;
  adminToday: string;
  adminLast7Days: string;
  adminLast30Days: string;
  adminCustom: string;
  adminTotalUsers: string;
  adminActiveUsers: string;
  adminNewUsers: string;
  adminPendingModeration: string;
  adminApprovedStories: string;
  adminRejectedStories: string;
  adminPublishedStories: string;
  adminNoAuditLogs: string;
  adminNoSessions: string;
  adminStatus: string;
  adminTelegramId: string;
  adminUid: string;
  adminLastActive: string;
  adminCreated: string;
  adminReports: string;
  adminWarnings: string;
  adminSaved: string;
  adminRecentActions: string;
  categories: Record<CategorySlug, string>;
}

export const dict: Record<Locale, Dict> = {
  en: {
    appName: "Loci",
    loading: "Loading…",
    errorGeneric: "Something went wrong",
    errorLocationDenied: "Location permission denied. Please allow location access in your device/app settings.",
    retry: "Retry",
    searchPlaceholder: "Search stories",
    menu: "Menu",
    trending: "Trending",
    noResults: "Nothing found",
    addStory: "Add story",
    tapMapToPlace: "Tap the map to place your memory",
    cancel: "Cancel",
    newStory: "New story",
    category: "Category",
    titleLabel: "Title",
    titlePlaceholder: "Name this moment",
    bodyLabel: "Story",
    bodyPlaceholder: "What happened here?",
    dateLabel: "Date (optional)",
    photosLabel: "Photos",
    addPhoto: "Add photo",
    pick: "Pick",
    change: "Change",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    locationLabel: "Location",
    locationApprox: "Approximate",
    locationExact: "Exact",
    locationApproxHint: "Shown within ~500 m of the real spot",
    visibilityLabel: "Visibility",
    visibilityPublic: "Public",
    visibilityPrivate: "Only me",
    postAnonymously: "Post anonymously",
    publish: "Publish",
    publishing: "Publishing…",
    done: "Done",
    anonymous: "Anonymous",
    comments: "Comments",
    commentPlaceholder: "Add a comment",
    send: "Send",
    noCommentsYet: "No comments yet",
    share: "Share",
    linkCopied: "Link copied",
    report: "Report",
    reported: "Reported",
    deleteStory: "Delete story",
    deleteComment: "Delete",
    saved: "Saved",
    save: "Save",
    profile: "Profile",
    myStories: "My stories",
    savedStories: "Saved",
    stats: "Stats",
    storiesCount: "stories",
    noStoriesYet: "No stories yet",
    noSavedYet: "Nothing saved yet",
    addFirstStory: "Add your first story",
    exploreMap: "Explore the map",
    openInTelegram: "Open in Telegram to sign in",
    locateMe: "Find my location",
    nearby: "Nearby",
    noNearby: "No stories found nearby",
    settings: "Settings",
    about: "About",
    languageLabel: "Language",
    themeLabel: "Appearance",
    themeAuto: "Auto",
    themeLight: "Light",
    themeDark: "Dark",
    aboutTagline: "Your memories on the map.",
    aboutWhat: "What is Loci?",
    aboutWhatBody: "Loci is a place to pin your personal stories to the real world. Every corner of a city holds memories — a first date, a favourite café, a moment you'll never forget. Loci makes those invisible threads visible.",
    aboutHow: "How it works",
    aboutHowBody: "Browse the map to find stories from people around you. Tap any pin to read what happened there. To add your own story, drop a pin on a meaningful spot, write about it, and optionally attach photos. You can share it publicly or keep it just for yourself.",
    aboutPrivacy: "Privacy first",
    aboutPrivacyBody: "Your location is never tracked in the background. When posting, you choose between an exact pin or an approximate one — shown within ~500 m of the real place. Anonymous posting is always available.",
    aboutTelegram: "Built for Telegram",
    aboutTelegramBody: "Loci runs as a Telegram Mini App. Signing in is instant — no passwords, no forms. Your Telegram account is your identity, and your stories travel with you.",
    statusPending: "Pending review",
    statusApproved: "Approved",
    statusRejected: "Rejected",
    reasonLabel: "Reason",
    pendingHint: "In review — visible only to you until approved.",
    resubmit: "Resubmit",
    edit: "Edit",
    moderation: "Moderation",
    approve: "Approve",
    reject: "Reject",
    rejectReasonPlaceholder: "Reason for rejection",
    queueEmpty: "Nothing to review",
    loadMore: "Load more",
    adminOnly: "You don't have access to moderation.",
    storySentTitle: "Story sent for review",
    storySentBody: "We've sent your story to review. It'll appear on the map once our team checks it — please give us a little time.",
    gotIt: "Got it",
    confirm: "Confirm",
    deleting: "Deleting…",
    confirmDeleteTitle: "Delete this story?",
    confirmDeleteBody: "This permanently removes your story and all its comments and reactions for everyone. This can't be undone.",
    confirmReportTitle: "Report this story?",
    confirmReportBody: "Our team will review this story. Report it only if it breaks the rules.",
    adminDashboard: "Dashboard",
    adminUsers: "Users",
    adminAuditLogs: "Audit logs",
    adminSearchUsers: "Search by UID, Telegram ID, username, or name",
    adminActive: "Active",
    adminBlocked: "Blocked",
    adminDeleted: "Deleted",
    adminSortBy: "Sort by",
    adminPrevious: "Previous",
    adminNext: "Next",
    adminNoUsers: "No users found",
    adminBlock: "Block",
    adminUnblock: "Unblock",
    adminWarning: "Add warning",
    adminDeleteAccount: "Delete account",
    adminRestoreAccount: "Restore account",
    adminReasonPlaceholder: "Reason required",
    adminReasonRequired: "Enter a reason",
    adminSessions: "Sessions",
    adminHistory: "Moderation history",
    adminToday: "Today",
    adminLast7Days: "Last 7 days",
    adminLast30Days: "Last 30 days",
    adminCustom: "Custom",
    adminTotalUsers: "Total users",
    adminActiveUsers: "Active users",
    adminNewUsers: "New users",
    adminPendingModeration: "Pending moderation",
    adminApprovedStories: "Approved stories",
    adminRejectedStories: "Rejected stories",
    adminPublishedStories: "Published stories",
    adminNoAuditLogs: "No audit actions yet",
    adminNoSessions: "No sessions recorded",
    adminStatus: "Status",
    adminTelegramId: "Telegram ID",
    adminUid: "UID",
    adminLastActive: "Last active",
    adminCreated: "Registered",
    adminReports: "Reports received",
    adminWarnings: "Warnings",
    adminSaved: "Saved stories",
    adminRecentActions: "Recent admin actions",
    categories: {
      love: "Love",
      happy_moments: "Happy Moments",
      dreams: "Dreams",
      education: "Education",
      career: "Career",
      travel: "Travel",
      friendship: "Friendship",
      childhood: "Childhood",
      achievements: "Achievements",
      beautiful_places: "Beautiful Places",
      memories: "Memories",
      urban_legends: "Urban Legends",
    },
  },
  kk: {
    appName: "Loci",
    loading: "Жүктелуде…",
    errorGeneric: "Бірдеңе дұрыс болмады",
    errorLocationDenied: "Орналасуды анықтауға рұқсат берілмеді. Құрылғы немесе қолданба параметрлерінде рұқсат беріңіз.",
    retry: "Қайталау",
    searchPlaceholder: "Оқиғаларды іздеу",
    menu: "Мәзір",
    trending: "Танымал",
    noResults: "Ештеңе табылмады",
    addStory: "Оқиға қосу",
    tapMapToPlace: "Естелік орнын картадан таңдаңыз",
    cancel: "Болдырмау",
    newStory: "Жаңа оқиға",
    category: "Санат",
    titleLabel: "Атауы",
    titlePlaceholder: "Осы сәтке ат қойыңыз",
    bodyLabel: "Оқиға",
    bodyPlaceholder: "Мұнда не болды?",
    dateLabel: "Күні (міндетті емес)",
    photosLabel: "Фотолар",
    addPhoto: "Фото қосу",
    pick: "Таңдау",
    change: "Өзгерту",
    previousMonth: "Алдыңғы ай",
    nextMonth: "Келесі ай",
    locationLabel: "Орналасқан жері",
    locationApprox: "Шамамен",
    locationExact: "Нақты",
    locationApproxHint: "Нақты орыннан ~500 м шегінде көрсетіледі",
    visibilityLabel: "Көріну",
    visibilityPublic: "Барлығына",
    visibilityPrivate: "Тек маған",
    postAnonymously: "Анонимді жариялау",
    publish: "Жариялау",
    publishing: "Жариялануда…",
    done: "Дайын",
    anonymous: "Аноним",
    comments: "Пікірлер",
    commentPlaceholder: "Пікір қосу",
    send: "Жіберу",
    noCommentsYet: "Әзірге пікір жоқ",
    share: "Бөлісу",
    linkCopied: "Сілтеме көшірілді",
    report: "Шағымдану",
    reported: "Шағым жіберілді",
    deleteStory: "Оқиғаны жою",
    deleteComment: "Жою",
    saved: "Сақталды",
    save: "Сақтау",
    profile: "Профиль",
    myStories: "Менің оқиғаларым",
    savedStories: "Сақталғандар",
    stats: "Статистика",
    storiesCount: "оқиға",
    noStoriesYet: "Әзірге оқиға жоқ",
    noSavedYet: "Әзірге ештеңе сақталмаған",
    addFirstStory: "Алғашқы оқиғаңызды қосыңыз",
    exploreMap: "Картаны шолу",
    openInTelegram: "Кіру үшін Telegram-да ашыңыз",
    locateMe: "Орналасқан жерімді табу",
    nearby: "Жақын маңда",
    noNearby: "Жақын маңда оқиғалар табылмады",
    settings: "Параметрлер",
    about: "Қосымша туралы",
    languageLabel: "Тіл",
    themeLabel: "Сыртқы түр",
    themeAuto: "Авто",
    themeLight: "Жарық",
    themeDark: "Қараңғы",
    aboutTagline: "Естеліктеріңіз картада.",
    aboutWhat: "Loci дегеніміз не?",
    aboutWhatBody: "Loci — жеке оқиғаларды нақты орындарға бекітуге арналған платформа. Қаланың әрбір бұрышында естеліктер тұр: алғашқы кездесу, сүйікті кафе, ұмытылмас сәт. Loci осы көзге көрінбейтін байланыстарды айқын етеді.",
    aboutHow: "Қалай жұмыс істейді",
    aboutHowBody: "Картаны шолып, айналаңыздағы адамдардың оқиғаларын табыңыз. Кез келген таңбашаға басып, онда не болғанын оқыңыз. Өз оқиғаңызды қосу үшін мағыналы орынға таңбаша қойып, жазыңыз және фото қосыңыз. Оны жариялауға немесе өзіңізге қалдыруға болады.",
    aboutPrivacy: "Құпиялылық бірінші",
    aboutPrivacyBody: "Орналасқан жеріңіз фонда ешқашан бақыланбайды. Жариялаған кезде нақты немесе шамамен орынды таңдайсыз — нақты жерден ~500 м шегінде көрсетіледі. Анонимді жариялау әрқашан қолжетімді.",
    aboutTelegram: "Telegram үшін жасалған",
    aboutTelegramBody: "Loci Telegram Mini App ретінде жұмыс істейді. Кіру лезде — пароль де, форма да жоқ. Telegram аккаунтыңыз — сіздің жеке куәлігіңіз.",
    statusPending: "Тексерілуде",
    statusApproved: "Мақұлданған",
    statusRejected: "Қабылданбады",
    reasonLabel: "Себебі",
    pendingHint: "Тексерілуде — мақұлданғанша тек сізге көрінеді.",
    resubmit: "Қайта жіберу",
    edit: "Өңдеу",
    moderation: "Модерация",
    approve: "Мақұлдау",
    reject: "Қабылдамау",
    rejectReasonPlaceholder: "Қабылдамау себебі",
    queueEmpty: "Тексеретін ештеңе жоқ",
    loadMore: "Тағы жүктеу",
    adminOnly: "Сізде модерацияға рұқсат жоқ.",
    storySentTitle: "Оқиға тексеруге жіберілді",
    storySentBody: "Оқиғаңызды тексеруге жібердік. Біздің команда тексергеннен кейін ол картада көрінеді — сәл уақыт беріңіз.",
    gotIt: "Түсінікті",
    confirm: "Растау",
    deleting: "Жойылуда…",
    confirmDeleteTitle: "Бұл оқиғаны жою керек пе?",
    confirmDeleteBody: "Бұл оқиғаңызды және оның барлық пікірлері мен реакцияларын барлығы үшін біржола жояды. Мұны қайтару мүмкін емес.",
    confirmReportTitle: "Бұл оқиғаға шағым жасау керек пе?",
    confirmReportBody: "Біздің команда бұл оқиғаны қарайды. Тек ережені бұзса ғана шағым жасаңыз.",
    adminDashboard: "Басқару тақтасы",
    adminUsers: "Пайдаланушылар",
    adminAuditLogs: "Аудит журналы",
    adminSearchUsers: "UID, Telegram ID, username немесе атпен іздеу",
    adminActive: "Белсенді",
    adminBlocked: "Бұғатталған",
    adminDeleted: "Жойылған",
    adminSortBy: "Сұрыптау",
    adminPrevious: "Алдыңғы",
    adminNext: "Келесі",
    adminNoUsers: "Пайдаланушылар табылмады",
    adminBlock: "Бұғаттау",
    adminUnblock: "Бұғаттан шығару",
    adminWarning: "Ескерту қосу",
    adminDeleteAccount: "Аккаунтты жою",
    adminRestoreAccount: "Аккаунтты қалпына келтіру",
    adminReasonPlaceholder: "Себеп міндетті",
    adminReasonRequired: "Себеп енгізіңіз",
    adminSessions: "Сессиялар",
    adminHistory: "Модерация тарихы",
    adminToday: "Бүгін",
    adminLast7Days: "Соңғы 7 күн",
    adminLast30Days: "Соңғы 30 күн",
    adminCustom: "Арнайы",
    adminTotalUsers: "Барлық пайдаланушы",
    adminActiveUsers: "Белсенді пайдаланушы",
    adminNewUsers: "Жаңа пайдаланушы",
    adminPendingModeration: "Күтудегі модерация",
    adminApprovedStories: "Мақұлданған оқиға",
    adminRejectedStories: "Қабылданбаған оқиға",
    adminPublishedStories: "Жарияланған оқиға",
    adminNoAuditLogs: "Аудит әрекеттері жоқ",
    adminNoSessions: "Сессиялар тіркелмеген",
    adminStatus: "Күйі",
    adminTelegramId: "Telegram ID",
    adminUid: "UID",
    adminLastActive: "Соңғы белсенділік",
    adminCreated: "Тіркелген",
    adminReports: "Алынған шағым",
    adminWarnings: "Ескертулер",
    adminSaved: "Сақталған оқиға",
    adminRecentActions: "Соңғы әкімші әрекеттері",
    categories: {
      love: "Махаббат",
      happy_moments: "Бақытты сәттер",
      dreams: "Армандар",
      education: "Білім",
      career: "Мансап",
      travel: "Саяхат",
      friendship: "Достық",
      childhood: "Балалық шақ",
      achievements: "Жетістіктер",
      beautiful_places: "Әдемі жерлер",
      memories: "Естеліктер",
      urban_legends: "Қала аңыздары",
    },
  },
  ru: {
    appName: "Loci",
    loading: "Загрузка…",
    errorGeneric: "Что-то пошло не так",
    errorLocationDenied: "Доступ к геопозиции запрещен. Пожалуйста, разрешите доступ в настройках устройства или приложения.",
    retry: "Повторить",
    searchPlaceholder: "Поиск историй",
    menu: "Меню",
    trending: "Популярное",
    noResults: "Ничего не найдено",
    addStory: "Добавить историю",
    tapMapToPlace: "Коснитесь карты, чтобы выбрать место",
    cancel: "Отмена",
    newStory: "Новая история",
    category: "Категория",
    titleLabel: "Название",
    titlePlaceholder: "Назовите этот момент",
    bodyLabel: "История",
    bodyPlaceholder: "Что здесь произошло?",
    dateLabel: "Дата (необязательно)",
    photosLabel: "Фото",
    addPhoto: "Добавить фото",
    pick: "Выбрать",
    change: "Изменить",
    previousMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    locationLabel: "Место",
    locationApprox: "Примерно",
    locationExact: "Точно",
    locationApproxHint: "Показывается в пределах ~500 м от места",
    visibilityLabel: "Видимость",
    visibilityPublic: "Всем",
    visibilityPrivate: "Только мне",
    postAnonymously: "Опубликовать анонимно",
    publish: "Опубликовать",
    publishing: "Публикация…",
    done: "Готово",
    anonymous: "Аноним",
    comments: "Комментарии",
    commentPlaceholder: "Добавить комментарий",
    send: "Отправить",
    noCommentsYet: "Пока нет комментариев",
    share: "Поделиться",
    linkCopied: "Ссылка скопирована",
    report: "Пожаловаться",
    reported: "Жалоба отправлена",
    deleteStory: "Удалить историю",
    deleteComment: "Удалить",
    saved: "Сохранено",
    save: "Сохранить",
    profile: "Профиль",
    myStories: "Мои истории",
    savedStories: "Сохранённые",
    stats: "Статистика",
    storiesCount: "историй",
    noStoriesYet: "Пока нет историй",
    noSavedYet: "Пока ничего не сохранено",
    addFirstStory: "Добавьте первую историю",
    exploreMap: "Смотреть карту",
    openInTelegram: "Откройте в Telegram, чтобы войти",
    locateMe: "Где я?",
    nearby: "Рядом",
    noNearby: "Рядом историй не найдено",
    settings: "Настройки",
    about: "О приложении",
    languageLabel: "Язык",
    themeLabel: "Оформление",
    themeAuto: "Авто",
    themeLight: "Светлая",
    themeDark: "Тёмная",
    aboutTagline: "Ваши воспоминания на карте.",
    aboutWhat: "Что такое Loci?",
    aboutWhatBody: "Loci — платформа для хранения личных историй, привязанных к реальным местам. В каждом уголке города живут воспоминания: первое свидание, любимое кафе, момент, который не забыть. Loci делает эти невидимые нити видимыми.",
    aboutHow: "Как это работает",
    aboutHowBody: "Листайте карту и находите истории людей вокруг вас. Нажмите на любую метку, чтобы прочитать, что там произошло. Чтобы добавить свою историю, поставьте метку в значимом месте, напишите о нём и прикрепите фото. Можно поделиться публично или оставить только для себя.",
    aboutPrivacy: "Приватность прежде всего",
    aboutPrivacyBody: "Ваше местоположение никогда не отслеживается в фоне. При публикации вы сами выбираете: точное место или приблизительное — в пределах ~500 м. Анонимная публикация всегда доступна.",
    aboutTelegram: "Создано для Telegram",
    aboutTelegramBody: "Loci работает как Telegram Mini App. Вход мгновенный — никаких паролей и форм. Ваш аккаунт Telegram — это ваша личность.",
    statusPending: "На проверке",
    statusApproved: "Одобрено",
    statusRejected: "Отклонено",
    reasonLabel: "Причина",
    pendingHint: "На проверке — видно только вам до одобрения.",
    resubmit: "Отправить снова",
    edit: "Изменить",
    moderation: "Модерация",
    approve: "Одобрить",
    reject: "Отклонить",
    rejectReasonPlaceholder: "Причина отклонения",
    queueEmpty: "Нечего проверять",
    loadMore: "Загрузить ещё",
    adminOnly: "У вас нет доступа к модерации.",
    storySentTitle: "История отправлена на проверку",
    storySentBody: "Мы отправили вашу историю на проверку. Она появится на карте после того, как наша команда её проверит — пожалуйста, подождите немного.",
    gotIt: "Понятно",
    confirm: "Подтвердить",
    deleting: "Удаление…",
    confirmDeleteTitle: "Удалить эту историю?",
    confirmDeleteBody: "Это навсегда удалит вашу историю со всеми комментариями и реакциями для всех. Отменить нельзя.",
    confirmReportTitle: "Пожаловаться на эту историю?",
    confirmReportBody: "Наша команда проверит эту историю. Жалуйтесь только если она нарушает правила.",
    adminDashboard: "Панель управления",
    adminUsers: "Пользователи",
    adminAuditLogs: "Журнал аудита",
    adminSearchUsers: "Поиск по UID, Telegram ID, username или имени",
    adminActive: "Активные",
    adminBlocked: "Заблокированные",
    adminDeleted: "Удалённые",
    adminSortBy: "Сортировка",
    adminPrevious: "Назад",
    adminNext: "Далее",
    adminNoUsers: "Пользователи не найдены",
    adminBlock: "Заблокировать",
    adminUnblock: "Разблокировать",
    adminWarning: "Добавить предупреждение",
    adminDeleteAccount: "Удалить аккаунт",
    adminRestoreAccount: "Восстановить аккаунт",
    adminReasonPlaceholder: "Причина обязательна",
    adminReasonRequired: "Введите причину",
    adminSessions: "Сессии",
    adminHistory: "История модерации",
    adminToday: "Сегодня",
    adminLast7Days: "Последние 7 дней",
    adminLast30Days: "Последние 30 дней",
    adminCustom: "Период",
    adminTotalUsers: "Всего пользователей",
    adminActiveUsers: "Активные пользователи",
    adminNewUsers: "Новые пользователи",
    adminPendingModeration: "На модерации",
    adminApprovedStories: "Одобренные истории",
    adminRejectedStories: "Отклонённые истории",
    adminPublishedStories: "Опубликованные истории",
    adminNoAuditLogs: "Аудит пока пуст",
    adminNoSessions: "Сессии не записаны",
    adminStatus: "Статус",
    adminTelegramId: "Telegram ID",
    adminUid: "UID",
    adminLastActive: "Последняя активность",
    adminCreated: "Регистрация",
    adminReports: "Жалоб получено",
    adminWarnings: "Предупреждения",
    adminSaved: "Сохранённые истории",
    adminRecentActions: "Последние действия администраторов",
    categories: {
      love: "Любовь",
      happy_moments: "Счастливые моменты",
      dreams: "Мечты",
      education: "Образование",
      career: "Карьера",
      travel: "Путешествия",
      friendship: "Дружба",
      childhood: "Детство",
      achievements: "Достижения",
      beautiful_places: "Красивые места",
      memories: "Воспоминания",
      urban_legends: "Городские легенды",
    },
  },
};

export function resolveLocale(languageCode: string | undefined): Locale {
  if (languageCode && (locales as readonly string[]).includes(languageCode)) {
    return languageCode as Locale;
  }
  return defaultLocale;
}
