/** Static copy and asset paths for the home marketing cards. */
export const HOME_FEATURE_CARDS = [
  {
    src: "/home-cards/CardHangout.webp",
    alt: "Friends watching together from different places in a cozy hangout",
    cardWidth: 1536,
    cardHeight: 1024,
    textSrc: "/home-texts/hangout.png",
    textAlt: "Hangout — word art under the hangout card",
    textWidth: 689,
    textHeight: 226,
    a: "Watch",
    b: "Laugh",
    c: "Hangout",
  },
  {
    src: "/home-cards/CardStudy.webp",
    alt: "Students in different rooms focused on the same shared session",
    cardWidth: 1536,
    cardHeight: 1024,
    textSrc: "/home-texts/study.png",
    textAlt: "Study — word art under the study card",
    textWidth: 479,
    textHeight: 228,
    a: "Watch",
    b: "Learn",
    c: "Study",
  },
  {
    src: "/home-cards/CardJam.webp",
    alt: "People in different locations sharing a music and vibe session",
    cardWidth: 1473,
    cardHeight: 960,
    textSrc: "/home-texts/jam.png",
    textAlt: "Jam — word art under the jam card",
    textWidth: 363,
    textHeight: 238,
    a: "Listen",
    b: "Share",
    c: "Jam",
  },
] as const;

export type HomeFeatureCard = (typeof HOME_FEATURE_CARDS)[number];
