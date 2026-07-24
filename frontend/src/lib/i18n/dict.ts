export const locales = ["en", "kk", "ru"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export type LegalDocBlock = { h: string } | { p: string } | { ul: string[] };

export interface LegalStrings {
  privacy: LegalDocBlock[];
  terms: LegalDocBlock[];
  backHome: string;
  contact: string;
  contactUnavailable: string;
}

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
  noPhotos: string;
  addPhoto: string;
  pick: string;
  change: string;
  previousMonth: string;
  nextMonth: string;
  editPhoto: string;
  apply: string;
  photoInvalid: string;
  photoUploadFailed: string;
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
  close: string;
  viewPhoto: string;
  comments: string;
  commentPlaceholder: string;
  send: string;
  noCommentsYet: string;
  share: string;
  shareText: string;
  linkCopied: string;
  report: string;
  reported: string;
  deleteStory: string;
  deletePhoto: string;
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
  auth: AuthStrings;
  locateMe: string;
  showAllPins: string;
  showClusters: string;
  mapView: string;
  mapLabels: string;
  mapLight: string;
  mapDark: string;
  mapNone: string;
  mapCountries: string;
  mapAllDetails: string;
  mapClean: string;
  mapBright: string;
  nearby: string;
  noNearby: string;
  previousStory: string;
  nextStory: string;
  backToPreviousStory: string;
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
  aboutPrivacyPolicy: string;
  aboutTerms: string;
  aboutGithub: string;
  legal: LegalStrings;
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
  storyPublishedBody: string;
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
  adminFrom: string;
  adminTo: string;
  adminStoryReports: string;
  reportTab: string;
  reportSearch: string;
  reportEmpty: string;
  reportFilterAll: string;
  reportFilterPending: string;
  reportFilterHidden: string;
  reportFilterVisible: string;
  reportFilterResolved: string;
  reportSortReports: string;
  reportSortNewest: string;
  reportSortHidden: string;
  reportReporters: string;
  reportAutoHidden: string;
  reportHidden: string;
  reportVisible: string;
  reportActionRestore: string;
  reportActionKeepHidden: string;
  reportActionDelete: string;
  reportActionIgnore: string;
  reportConfirmRestore: string;
  reportConfirmKeepHidden: string;
  reportConfirmDelete: string;
  reportConfirmIgnore: string;
  reportOpenAuthor: string;
  reportTimeline: string;
  reportNoReason: string;
  reportStatusPending: string;
  reportStatusReviewed: string;
  reportStatusResolved: string;
  reportAnalytics: string;
  reportPending: string;
  reportAutoHiddenCount: string;
  reportResolved: string;
  reportDeleted: string;
  reportRestored: string;
  reportAvgReview: string;
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

interface AuthStrings {
  signIn: string;
  subtitle: string;
  continueGoogle: string;
  continueEmail: string;
  email: string;
  password: string;
  passwordHint: string;
  signInAction: string;
  createAccount: string;
  toRegister: string;
  toLogin: string;
  forgot: string;
  verifyTitle: string;
  verifySubtitle: string;
  code: string;
  verifyAction: string;
  resend: string;
  resendIn: string;
  resent: string;
  forgotTitle: string;
  forgotSubtitle: string;
  sendCode: string;
  resetTitle: string;
  newPassword: string;
  resetAction: string;
  resetDone: string;
  checkEmail: string;
  back: string;
  cancelled: string;
  genericError: string;
  invalidCredentials: string;
  invalidCode: string;
  account: string;
  methods: string;
  sessions: string;
  connected: string;
  add: string;
  remove: string;
  thisDevice: string;
  logOut: string;
  logOutEverywhere: string;
  lastMethod: string;
  reauthNeeded: string;
  reauthAction: string;
  telegram: string;
  google: string;
  emailProvider: string;
  addEmailTitle: string;
  cancel: string;
  confirmRemove: string;
  loadingAccount: string;
  accountLoadError: string;
  accountActionError: string;
  providerConflict: string;
  noSessions: string;
  dangerZone: string;
  deleteAccount: string;
  deleteAccountDescription: string;
  deleteAccountWarning: string;
  deleteConfirmationLabel: string;
  deleteAccountAction: string;
  deleteAccountError: string;
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
    noPhotos: "No photos",
    addPhoto: "Add photo",
    pick: "Pick",
    change: "Change",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    editPhoto: "Edit photo",
    apply: "Apply",
    photoInvalid: "Choose a valid image up to 10 MB.",
    photoUploadFailed: "Story sent. One or more photos could not be uploaded.",
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
    close: "Close",
    viewPhoto: "View photo",
    comments: "Comments",
    commentPlaceholder: "Add a comment",
    send: "Send",
    noCommentsYet: "No comments yet",
    share: "Share",
    shareText: "See this story on Loci:",
    linkCopied: "Link copied",
    report: "Report",
    reported: "Reported",
    deleteStory: "Delete story",
    deletePhoto: "Delete photo",
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
    auth: {
      signIn: "Sign in",
      subtitle: "Sign in to add stories, save places, and manage your profile.",
      continueGoogle: "Continue with Google",
      continueEmail: "Continue with email",
      email: "Email",
      password: "Password",
      passwordHint: "At least 12 characters",
      signInAction: "Sign in",
      createAccount: "Create account",
      toRegister: "New to Loci? Create an account",
      toLogin: "Already have an account? Sign in",
      forgot: "Forgot password?",
      verifyTitle: "Enter the code",
      verifySubtitle: "We sent a 6-digit code to your email.",
      code: "Verification code",
      verifyAction: "Verify",
      resend: "Resend code",
      resendIn: "Resend in {seconds}s",
      resent: "A new code has been sent.",
      forgotTitle: "Reset your password",
      forgotSubtitle: "Enter your email and we'll send a reset code.",
      sendCode: "Send code",
      resetTitle: "Set a new password",
      newPassword: "New password",
      resetAction: "Update password",
      resetDone: "Password updated. Please sign in.",
      checkEmail: "Check your email for a verification code.",
      back: "Back",
      cancelled: "Sign-in was cancelled.",
      genericError: "Something went wrong. Please try again.",
      invalidCredentials: "Invalid email or password.",
      invalidCode: "That code is invalid or expired.",
      account: "Account",
      methods: "Sign-in methods",
      sessions: "Active sessions",
      connected: "Connected",
      add: "Add",
      remove: "Remove",
      thisDevice: "This device",
      logOut: "Log out",
      logOutEverywhere: "Log out everywhere",
      lastMethod: "You can't remove your only sign-in method.",
      reauthNeeded: "Please sign in again to make this change.",
      reauthAction: "Sign in again",
      telegram: "Telegram",
      google: "Google",
      emailProvider: "Email",
      addEmailTitle: "Add email sign-in",
      cancel: "Cancel",
      confirmRemove: "Remove",
      loadingAccount: "Loading account…",
      accountLoadError: "Account details could not be loaded.",
      accountActionError: "The account change could not be completed.",
      providerConflict: "That sign-in method belongs to another account.",
      noSessions: "No active sessions.",
      dangerZone: "Danger zone",
      deleteAccount: "Delete account",
      deleteAccountDescription: "Permanently erase your stories, photos, activity, profile, and sign-in methods.",
      deleteAccountWarning: "This cannot be undone. Encrypted backups expire according to the retention schedule.",
      deleteConfirmationLabel: "Type this phrase to continue:",
      deleteAccountAction: "Delete permanently",
      deleteAccountError: "Your account could not be deleted. Please try again.",
    },
    locateMe: "Find my location",
    showAllPins: "Show every pin",
    showClusters: "Group pins into clusters",
    mapView: "Map view",
    mapLabels: "Labels",
    mapLight: "Light map",
    mapDark: "Dark map",
    mapNone: "No labels",
    mapCountries: "Countries only",
    mapAllDetails: "All places",
    mapClean: "Clean map",
    mapBright: "Detailed map",
    nearby: "Nearby",
    noNearby: "No stories found nearby",
    previousStory: "Previous nearby story",
    nextStory: "Next nearby story",
    backToPreviousStory: "Back to previous story",
    settings: "Settings",
    about: "About",
    languageLabel: "Language",
    themeLabel: "Appearance",
    themeAuto: "Auto",
    themeLight: "Light",
    themeDark: "Dark",
    aboutTagline: "Your memories on the map.",
    aboutWhat: "What is Loci?",
    aboutWhatBody: "Loci is a place to pin your personal stories to the real world. Every corner of a city holds memories: a first date, a favourite café, a moment you'll never forget. Loci makes those invisible threads visible.",
    aboutHow: "How it works",
    aboutHowBody: "Browse the map to find stories from people around you. Tap any pin to read what happened there. To add your own story, drop a pin on a meaningful spot, write about it, and optionally attach photos. You can share it publicly or keep it just for yourself.",
    aboutPrivacy: "Privacy first",
    aboutPrivacyBody: "Your location is never tracked in the background. When posting, you choose between an exact pin or an approximate one, shown within ~500 m of the real place. Anonymous posting is always available.",
    aboutTelegram: "Built for Telegram",
    aboutTelegramBody: "Loci works in Telegram and in a browser. Sign in with Telegram, Google, or email; linked methods open the same Loci account.",
    aboutPrivacyPolicy: "Privacy Policy",
    aboutTerms: "Terms & Guidelines",
    aboutGithub: "GitHub",
    legal: {
      privacy: [
        { p: "Loci is a map for meaningful stories. This policy explains what data we use and why. Last updated 24 July 2026." },
        { h: "Account data" },
        { p: "Depending on how you sign in, we store a Telegram identity, a Google account identifier, or a verified email address. Passwords are stored only as one-way Argon2id hashes." },
        { h: "Stories and location" },
        { p: "We store stories, optional photos and dates, reactions, bookmarks, reports, and the location you choose. Approximate locations are shifted on the server; the exact coordinate is never returned for an approximate story." },
        { h: "Anonymous stories" },
        { p: "Anonymous stories stay linked to your account internally so you can manage them, but your identity is not included in public responses." },
        { h: "Your choices" },
        { ul: ["You can edit or delete your stories.", "You can review and end active sessions.", "You can permanently erase your account and associated data from account settings."] },
        { p: "Account erasure removes active data immediately and queues photo deletion for reliable retry. Non-identifying moderation records remain where required for audit integrity. Encrypted backups expire under the infrastructure retention schedule." },
        { h: "Data use" },
        { p: "We do not sell personal data, show third-party ads, track you across other services, or read Telegram messages." },
      ],
      terms: [
        { p: "By using Loci you agree to these terms and community rules. Last updated 24 July 2026." },
        { h: "Your content" },
        { p: "You keep ownership of your stories. You give Loci permission to display them where needed to operate the map and shared story pages, until you remove them." },
        { h: "Use Loci responsibly" },
        { ul: ["Share content you have the right to publish.", "Use approximate placement for private or sensitive locations.", "Do not post illegal, hateful, harassing, sexual, deceptive, or spam content.", "Do not expose another person's private information or home location without consent."] },
        { h: "Moderation" },
        { p: "Public stories require review. Reported content may be hidden while a human moderator decides whether to restore, keep hidden, or remove it. Repeated violations may restrict an account." },
        { h: "Service availability" },
        { p: "Loci is provided as available, without a guarantee of uninterrupted service or the accuracy of content posted by other people." },
      ],
      backHome: "Back to Loci",
      contact: "Privacy support",
      contactUnavailable: "A support address must be configured before public launch.",
    },
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
    storyPublishedBody: "Your private story is saved. Only you can see it on the map.",
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
    adminFrom: "From",
    adminTo: "To",
    adminStoryReports: "reports",
    reportTab: "Reported",
    reportSearch: "Search reported stories",
    reportEmpty: "No reported content",
    reportFilterAll: "All reported",
    reportFilterPending: "Needs review",
    reportFilterHidden: "Hidden",
    reportFilterVisible: "Visible",
    reportFilterResolved: "Resolved",
    reportSortReports: "Most reports",
    reportSortNewest: "Newest reports",
    reportSortHidden: "Auto-hidden first",
    reportReporters: "reporters",
    reportAutoHidden: "Auto-hidden",
    reportHidden: "Hidden",
    reportVisible: "Visible",
    reportActionRestore: "Restore",
    reportActionKeepHidden: "Keep hidden",
    reportActionDelete: "Delete",
    reportActionIgnore: "Ignore reports",
    reportConfirmRestore: "Restore this story and make it visible again?",
    reportConfirmKeepHidden: "Keep this story hidden and mark the reports reviewed?",
    reportConfirmDelete: "Permanently delete this story? This cannot be undone.",
    reportConfirmIgnore: "Dismiss these reports and leave the story as is?",
    reportOpenAuthor: "Open author",
    reportTimeline: "Report timeline",
    reportNoReason: "No reason given",
    reportStatusPending: "pending",
    reportStatusReviewed: "reviewed",
    reportStatusResolved: "resolved",
    reportAnalytics: "Reported content",
    reportPending: "Pending reports",
    reportAutoHiddenCount: "Auto-hidden",
    reportResolved: "Resolved reports",
    reportDeleted: "Deleted after review",
    reportRestored: "Restored after review",
    reportAvgReview: "Avg review time",
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
    noPhotos: "Фотосурет жоқ",
    addPhoto: "Фото қосу",
    pick: "Таңдау",
    change: "Өзгерту",
    previousMonth: "Алдыңғы ай",
    nextMonth: "Келесі ай",
    editPhoto: "Фотосуретті өңдеу",
    apply: "Қолдану",
    photoInvalid: "10 МБ-қа дейінгі жарамды суретті таңдаңыз.",
    photoUploadFailed: "Оқиға жіберілді. Бір немесе бірнеше фотосуретті жүктеу мүмкін болмады.",
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
    close: "Жабу",
    viewPhoto: "Фотоны көру",
    comments: "Пікірлер",
    commentPlaceholder: "Пікір қосу",
    send: "Жіберу",
    noCommentsYet: "Әзірге пікір жоқ",
    share: "Бөлісу",
    shareText: "Loci-де осы оқиғаны қараңыз:",
    linkCopied: "Сілтеме көшірілді",
    report: "Шағымдану",
    reported: "Шағым жіберілді",
    deleteStory: "Оқиғаны жою",
    deletePhoto: "Фотоны жою",
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
    auth: {
      signIn: "Кіру",
      subtitle: "Оқиға қосу, орындарды сақтау және профильді басқару үшін кіріңіз.",
      continueGoogle: "Google арқылы жалғастыру",
      continueEmail: "Email арқылы жалғастыру",
      email: "Email",
      password: "Құпиясөз",
      passwordHint: "Кемінде 12 таңба",
      signInAction: "Кіру",
      createAccount: "Тіркелгі жасау",
      toRegister: "Loci-де жаңасыз ба? Тіркелгі жасаңыз",
      toLogin: "Тіркелгіңіз бар ма? Кіріңіз",
      forgot: "Құпиясөзді ұмыттыңыз ба?",
      verifyTitle: "Кодты енгізіңіз",
      verifySubtitle: "Поштаңызға 6 таңбалы код жібердік.",
      code: "Растау коды",
      verifyAction: "Растау",
      resend: "Кодты қайта жіберу",
      resendIn: "{seconds} с кейін қайта жіберу",
      resent: "Жаңа код жіберілді.",
      forgotTitle: "Құпиясөзді қалпына келтіру",
      forgotSubtitle: "Поштаңызды енгізіңіз, біз қалпына келтіру кодын жібереміз.",
      sendCode: "Код жіберу",
      resetTitle: "Жаңа құпиясөз орнату",
      newPassword: "Жаңа құпиясөз",
      resetAction: "Құпиясөзді жаңарту",
      resetDone: "Құпиясөз жаңартылды. Кіріңіз.",
      checkEmail: "Растау коды үшін поштаңызды тексеріңіз.",
      back: "Артқа",
      cancelled: "Кіру тоқтатылды.",
      genericError: "Бірдеңе дұрыс болмады. Қайталап көріңіз.",
      invalidCredentials: "Email немесе құпиясөз қате.",
      invalidCode: "Код жарамсыз немесе мерзімі өткен.",
      account: "Тіркелгі",
      methods: "Кіру әдістері",
      sessions: "Белсенді сеанстар",
      connected: "Қосылған",
      add: "Қосу",
      remove: "Жою",
      thisDevice: "Осы құрылғы",
      logOut: "Шығу",
      logOutEverywhere: "Барлық жерден шығу",
      lastMethod: "Жалғыз кіру әдісін жоя алмайсыз.",
      reauthNeeded: "Бұл өзгерісті енгізу үшін қайта кіріңіз.",
      reauthAction: "Қайта кіру",
      telegram: "Telegram",
      google: "Google",
      emailProvider: "Email",
      addEmailTitle: "Email кіруін қосу",
      cancel: "Бас тарту",
      confirmRemove: "Жою",
      loadingAccount: "Тіркелгі жүктелуде…",
      accountLoadError: "Тіркелгі деректерін жүктеу мүмкін болмады.",
      accountActionError: "Тіркелгідегі өзгерісті аяқтау мүмкін болмады.",
      providerConflict: "Бұл кіру әдісі басқа тіркелгіге тиесілі.",
      noSessions: "Белсенді сеанс жоқ.",
      dangerZone: "Қауіпті аймақ",
      deleteAccount: "Тіркелгіні жою",
      deleteAccountDescription: "Оқиғаларыңызды, фотоларыңызды, әрекеттеріңізді, профиліңізді және кіру әдістерін біржола жою.",
      deleteAccountWarning: "Бұл әрекетті кері қайтару мүмкін емес. Шифрланған сақтық көшірмелер сақтау кестесіне сай жойылады.",
      deleteConfirmationLabel: "Жалғастыру үшін мына тіркесті енгізіңіз:",
      deleteAccountAction: "Біржола жою",
      deleteAccountError: "Тіркелгіні жою мүмкін болмады. Қайталап көріңіз.",
    },
    locateMe: "Орналасқан жерімді табу",
    showAllPins: "Барлық белгіні көрсету",
    showClusters: "Белгілерді топтау",
    mapView: "Карта көрінісі",
    mapLabels: "Жазулар",
    mapLight: "Жарық карта",
    mapDark: "Қараңғы карта",
    mapNone: "Жазуларсыз",
    mapCountries: "Тек елдер",
    mapAllDetails: "Барлық орындар",
    mapClean: "Таза карта",
    mapBright: "Егжей-тегжейлі карта",
    nearby: "Жақын маңда",
    noNearby: "Жақын маңда оқиғалар табылмады",
    previousStory: "Алдыңғы жақын оқиға",
    nextStory: "Келесі жақын оқиға",
    backToPreviousStory: "Алдыңғы оқиғаға оралу",
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
    aboutTelegramBody: "Loci Telegram-да және браузерде жұмыс істейді. Telegram, Google немесе email арқылы кіріңіз; байланыстырылған әдістер бір Loci тіркелгісін ашады.",
    aboutPrivacyPolicy: "Құпиялылық саясаты",
    aboutTerms: "Шарттар мен ережелер",
    aboutGithub: "GitHub",
    legal: {
      privacy: [
        { p: "Loci — маңызды оқиғалар картасы. Бұл саясат қандай деректерді не үшін қолданатынымызды түсіндіреді. Соңғы жаңарту: 2026 жылғы 24 шілде." },
        { h: "Тіркелгі деректері" },
        { p: "Кіру әдісіне қарай Telegram идентификаторын, Google тіркелгі идентификаторын немесе расталған email мекенжайын сақтаймыз. Құпиясөздер тек Argon2id біржақты хэші ретінде сақталады." },
        { h: "Оқиғалар және орын" },
        { p: "Оқиғаларды, қосымша фото мен күнді, реакцияларды, бетбелгілерді, шағымдарды және сіз таңдаған орынды сақтаймыз. Шамамен орын серверде ығыстырылады; мұндай оқиғаның нақты координатасы ешқашан қайтарылмайды." },
        { h: "Анонимді оқиғалар" },
        { p: "Оқиғаны басқара алуыңыз үшін ол тіркелгіңізбен ішкі түрде байланысады, бірақ ашық жауаптарда жеке басыңыз көрсетілмейді." },
        { h: "Сіздің таңдауыңыз" },
        { ul: ["Оқиғаларыңызды өзгерте немесе жоя аласыз.", "Белсенді сеанстарды қарап, аяқтай аласыз.", "Тіркелгі параметрлерінен тіркелгіңізді және оған қатысты деректерді біржола жоя аласыз."] },
        { p: "Тіркелгіні жою белсенді деректерді бірден өшіреді және фотоларды сенімді түрде жою кезегіне қояды. Аудит тұтастығы үшін қажет, жеке басты анықтамайтын модерация жазбалары сақталады. Шифрланған сақтық көшірмелер инфрақұрылымдағы сақтау кестесіне сай жойылады." },
        { h: "Деректерді пайдалану" },
        { p: "Жеке деректерді сатпаймыз, бөгде жарнама көрсетпейміз, басқа сервистерде қадағаламаймыз және Telegram хабарламаларын оқымаймыз." },
      ],
      terms: [
        { p: "Loci-ді пайдалану арқылы осы шарттар мен қауымдастық ережелеріне келісесіз. Соңғы жаңарту: 2026 жылғы 24 шілде." },
        { h: "Сіздің контентіңіз" },
        { p: "Оқиғаларыңыздың иесі болып қала бересіз. Оларды жойғанға дейін карта мен ортақ беттерде сервистің жұмысы үшін көрсетуге Loci-ге рұқсат бересіз." },
        { h: "Loci-ді жауапкершілікпен пайдаланыңыз" },
        { ul: ["Жариялауға құқығыңыз бар контентті бөлісіңіз.", "Жеке немесе сезімтал орындар үшін шамамен орынды таңдаңыз.", "Заңсыз, өшпенді, қорлайтын, сексуалдық, алдамшы контент немесе спам жарияламаңыз.", "Басқа адамның жеке дерегін не үйінің орнын келісімсіз ашпаңыз."] },
        { h: "Модерация" },
        { p: "Ашық оқиғалар тексеріледі. Шағым түскен контентті адам-модератор қалпына келтіру, жасыру немесе жою туралы шешім қабылдағанша жасыруға болады. Қайталанған бұзушылықтар тіркелгіні шектеуі мүмкін." },
        { h: "Сервистің қолжетімділігі" },
        { p: "Loci қолжетімді болған күйінде ұсынылады; үздіксіз жұмыс пен басқа адамдар жариялаған контенттің дәлдігіне кепілдік берілмейді." },
      ],
      backHome: "Loci-ге оралу",
      contact: "Құпиялылық бойынша қолдау",
      contactUnavailable: "Ашық іске қосуға дейін қолдау мекенжайы бапталуы керек.",
    },
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
    storyPublishedBody: "Жеке оқиғаңыз сақталды. Оны картадан тек өзіңіз көресіз.",
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
    adminFrom: "Басы",
    adminTo: "Соңы",
    adminStoryReports: "шағым",
    reportTab: "Шағымдар",
    reportSearch: "Шағым түскен оқиғаларды іздеу",
    reportEmpty: "Шағым түскен мазмұн жоқ",
    reportFilterAll: "Барлық шағымдар",
    reportFilterPending: "Қарау керек",
    reportFilterHidden: "Жасырылған",
    reportFilterVisible: "Көрінетін",
    reportFilterResolved: "Шешілген",
    reportSortReports: "Ең көп шағым",
    reportSortNewest: "Жаңа шағымдар",
    reportSortHidden: "Алдымен жасырылғандар",
    reportReporters: "шағымданушы",
    reportAutoHidden: "Авто-жасырылған",
    reportHidden: "Жасырылған",
    reportVisible: "Көрінеді",
    reportActionRestore: "Қалпына келтіру",
    reportActionKeepHidden: "Жасырулы қалдыру",
    reportActionDelete: "Жою",
    reportActionIgnore: "Шағымдарды елемеу",
    reportConfirmRestore: "Бұл оқиғаны қалпына келтіріп, қайта көрсету керек пе?",
    reportConfirmKeepHidden: "Оқиғаны жасырулы қалдырып, шағымдарды қаралды деп белгілеу керек пе?",
    reportConfirmDelete: "Бұл оқиғаны біржола жою керек пе? Мұны қайтару мүмкін емес.",
    reportConfirmIgnore: "Бұл шағымдарды жауып, оқиғаны сол күйінде қалдыру керек пе?",
    reportOpenAuthor: "Авторды ашу",
    reportTimeline: "Шағымдар тарихы",
    reportNoReason: "Себебі көрсетілмеген",
    reportStatusPending: "күтуде",
    reportStatusReviewed: "қаралды",
    reportStatusResolved: "шешілді",
    reportAnalytics: "Шағым түскен мазмұн",
    reportPending: "Күтудегі шағымдар",
    reportAutoHiddenCount: "Авто-жасырылған",
    reportResolved: "Шешілген шағымдар",
    reportDeleted: "Қараудан кейін жойылған",
    reportRestored: "Қараудан кейін қалпына келтірілген",
    reportAvgReview: "Орташа қарау уақыты",
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
    noPhotos: "Нет фото",
    addPhoto: "Добавить фото",
    pick: "Выбрать",
    change: "Изменить",
    previousMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    editPhoto: "Изменить фото",
    apply: "Применить",
    photoInvalid: "Выберите корректное изображение размером до 10 МБ.",
    photoUploadFailed: "История отправлена. Не удалось загрузить одну или несколько фотографий.",
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
    close: "Закрыть",
    viewPhoto: "Открыть фото",
    comments: "Комментарии",
    commentPlaceholder: "Добавить комментарий",
    send: "Отправить",
    noCommentsYet: "Пока нет комментариев",
    share: "Поделиться",
    shareText: "Посмотрите эту историю в Loci:",
    linkCopied: "Ссылка скопирована",
    report: "Пожаловаться",
    reported: "Жалоба отправлена",
    deleteStory: "Удалить историю",
    deletePhoto: "Удалить фото",
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
    auth: {
      signIn: "Вход",
      subtitle: "Войдите, чтобы добавлять истории, сохранять места и управлять профилем.",
      continueGoogle: "Продолжить с Google",
      continueEmail: "Продолжить с email",
      email: "Email",
      password: "Пароль",
      passwordHint: "Не менее 12 символов",
      signInAction: "Войти",
      createAccount: "Создать аккаунт",
      toRegister: "Впервые в Loci? Создайте аккаунт",
      toLogin: "Уже есть аккаунт? Войдите",
      forgot: "Забыли пароль?",
      verifyTitle: "Введите код",
      verifySubtitle: "Мы отправили 6-значный код на вашу почту.",
      code: "Код подтверждения",
      verifyAction: "Подтвердить",
      resend: "Отправить код снова",
      resendIn: "Отправить снова через {seconds} с",
      resent: "Новый код отправлен.",
      forgotTitle: "Сброс пароля",
      forgotSubtitle: "Введите email, и мы отправим код для сброса.",
      sendCode: "Отправить код",
      resetTitle: "Задать новый пароль",
      newPassword: "Новый пароль",
      resetAction: "Обновить пароль",
      resetDone: "Пароль обновлён. Войдите снова.",
      checkEmail: "Проверьте почту — там код подтверждения.",
      back: "Назад",
      cancelled: "Вход отменён.",
      genericError: "Что-то пошло не так. Попробуйте снова.",
      invalidCredentials: "Неверный email или пароль.",
      invalidCode: "Код недействителен или истёк.",
      account: "Аккаунт",
      methods: "Способы входа",
      sessions: "Активные сеансы",
      connected: "Подключено",
      add: "Добавить",
      remove: "Удалить",
      thisDevice: "Это устройство",
      logOut: "Выйти",
      logOutEverywhere: "Выйти везде",
      lastMethod: "Нельзя удалить единственный способ входа.",
      reauthNeeded: "Войдите снова, чтобы выполнить это действие.",
      reauthAction: "Войти снова",
      telegram: "Telegram",
      google: "Google",
      emailProvider: "Email",
      addEmailTitle: "Добавить вход по email",
      cancel: "Отмена",
      confirmRemove: "Удалить",
      loadingAccount: "Загрузка аккаунта…",
      accountLoadError: "Не удалось загрузить данные аккаунта.",
      accountActionError: "Не удалось выполнить изменение аккаунта.",
      providerConflict: "Этот способ входа привязан к другому аккаунту.",
      noSessions: "Нет активных сеансов.",
      dangerZone: "Опасная зона",
      deleteAccount: "Удалить аккаунт",
      deleteAccountDescription: "Навсегда удалить истории, фотографии, действия, профиль и способы входа.",
      deleteAccountWarning: "Это действие нельзя отменить. Зашифрованные резервные копии удаляются по графику хранения.",
      deleteConfirmationLabel: "Для продолжения введите фразу:",
      deleteAccountAction: "Удалить навсегда",
      deleteAccountError: "Не удалось удалить аккаунт. Попробуйте снова.",
    },
    locateMe: "Где я?",
    showAllPins: "Показать все метки",
    showClusters: "Сгруппировать метки",
    mapView: "Вид карты",
    mapLabels: "Подписи",
    mapLight: "Светлая карта",
    mapDark: "Тёмная карта",
    mapNone: "Без подписей",
    mapCountries: "Только страны",
    mapAllDetails: "Все места",
    mapClean: "Чистая карта",
    mapBright: "Детальная карта",
    nearby: "Рядом",
    noNearby: "Рядом историй не найдено",
    previousStory: "Предыдущая история рядом",
    nextStory: "Следующая история рядом",
    backToPreviousStory: "Назад к предыдущей истории",
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
    aboutTelegramBody: "Loci работает в Telegram и браузере. Войдите через Telegram, Google или email; связанные способы открывают один аккаунт Loci.",
    aboutPrivacyPolicy: "Политика конфиденциальности",
    aboutTerms: "Условия и правила",
    aboutGithub: "GitHub",
    legal: {
      privacy: [
        { p: "Loci — карта значимых историй. Эта политика объясняет, какие данные мы используем и зачем. Обновлено 24 июля 2026 года." },
        { h: "Данные аккаунта" },
        { p: "В зависимости от способа входа мы храним идентификатор Telegram, идентификатор аккаунта Google или подтверждённый email. Пароли хранятся только как односторонние хеши Argon2id." },
        { h: "Истории и местоположение" },
        { p: "Мы храним истории, необязательные фото и даты, реакции, закладки, жалобы и выбранное вами место. Приблизительное место смещается на сервере; точные координаты такой истории никогда не возвращаются." },
        { h: "Анонимные истории" },
        { p: "История внутренне связана с аккаунтом, чтобы вы могли ею управлять, но ваша личность не включается в публичные ответы." },
        { h: "Ваш выбор" },
        { ul: ["Вы можете изменить или удалить свои истории.", "Вы можете просматривать и завершать активные сеансы.", "Вы можете навсегда удалить аккаунт и связанные данные в настройках аккаунта."] },
        { p: "Удаление аккаунта сразу удаляет активные данные и ставит фотографии в очередь с повторными попытками удаления. Неидентифицирующие записи модерации сохраняются, когда это необходимо для целостности аудита. Зашифрованные резервные копии удаляются согласно инфраструктурному графику хранения." },
        { h: "Использование данных" },
        { p: "Мы не продаём персональные данные, не показываем стороннюю рекламу, не отслеживаем вас в других сервисах и не читаем сообщения Telegram." },
      ],
      terms: [
        { p: "Используя Loci, вы соглашаетесь с этими условиями и правилами сообщества. Обновлено 24 июля 2026 года." },
        { h: "Ваш контент" },
        { p: "Вы сохраняете права на свои истории. До их удаления вы разрешаете Loci показывать их на карте и общих страницах, когда это необходимо для работы сервиса." },
        { h: "Используйте Loci ответственно" },
        { ul: ["Публикуйте только то, чем вправе делиться.", "Для частных и чувствительных мест выбирайте приблизительное размещение.", "Не публикуйте незаконный, ненавистнический, оскорбительный, сексуальный, обманный контент или спам.", "Не раскрывайте чужие личные данные или домашний адрес без согласия."] },
        { h: "Модерация" },
        { p: "Публичные истории проходят проверку. Контент с жалобами может быть скрыт, пока модератор не решит восстановить, оставить скрытым или удалить его. Повторные нарушения могут привести к ограничениям аккаунта." },
        { h: "Доступность сервиса" },
        { p: "Loci предоставляется по мере доступности, без гарантии непрерывной работы или точности контента, опубликованного другими людьми." },
      ],
      backHome: "Вернуться в Loci",
      contact: "Поддержка по вопросам приватности",
      contactUnavailable: "До публичного запуска необходимо настроить адрес поддержки.",
    },
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
    storyPublishedBody: "Ваша личная история сохранена. Её видите на карте только вы.",
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
    adminFrom: "С",
    adminTo: "По",
    adminStoryReports: "жалоб",
    reportTab: "Жалобы",
    reportSearch: "Поиск историй с жалобами",
    reportEmpty: "Нет контента с жалобами",
    reportFilterAll: "Все жалобы",
    reportFilterPending: "Нужен обзор",
    reportFilterHidden: "Скрытые",
    reportFilterVisible: "Видимые",
    reportFilterResolved: "Решённые",
    reportSortReports: "Больше жалоб",
    reportSortNewest: "Новые жалобы",
    reportSortHidden: "Сначала скрытые",
    reportReporters: "пожаловались",
    reportAutoHidden: "Авто-скрыто",
    reportHidden: "Скрыто",
    reportVisible: "Видно",
    reportActionRestore: "Восстановить",
    reportActionKeepHidden: "Оставить скрытой",
    reportActionDelete: "Удалить",
    reportActionIgnore: "Отклонить жалобы",
    reportConfirmRestore: "Восстановить историю и снова показать её?",
    reportConfirmKeepHidden: "Оставить историю скрытой и отметить жалобы рассмотренными?",
    reportConfirmDelete: "Удалить историю навсегда? Это нельзя отменить.",
    reportConfirmIgnore: "Отклонить эти жалобы и оставить историю как есть?",
    reportOpenAuthor: "Открыть автора",
    reportTimeline: "История жалоб",
    reportNoReason: "Причина не указана",
    reportStatusPending: "ожидает",
    reportStatusReviewed: "рассмотрено",
    reportStatusResolved: "решено",
    reportAnalytics: "Контент с жалобами",
    reportPending: "Ожидающие жалобы",
    reportAutoHiddenCount: "Авто-скрыто",
    reportResolved: "Решённые жалобы",
    reportDeleted: "Удалено после обзора",
    reportRestored: "Восстановлено после обзора",
    reportAvgReview: "Среднее время обзора",
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
