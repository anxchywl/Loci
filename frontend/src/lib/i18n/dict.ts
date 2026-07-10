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
  settings: string;
  about: string;
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
    settings: "Settings",
    about: "About",
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
    settings: "Параметрлер",
    about: "Қосымша туралы",
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
    settings: "Настройки",
    about: "О приложении",
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
