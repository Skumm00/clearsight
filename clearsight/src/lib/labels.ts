/**
 * User-facing names and plain-language notes for the model's classes.
 * Spot-checking the original training folders showed that "Eyelid drooping" is mostly eyelid lumps
 * and "Uveitis" is mostly red eyes with visible bleeding, so the interface uses descriptive names
 * instead of implying a diagnosis. Unknown labels fall back to the raw name.
 */
export interface ConditionInfo {
  name: string;
  about: string;
  seek: string;
  looksLike: string;
  habits: { title: string; body: string }[];
}

const CONDITIONS: Record<string, ConditionInfo> = {
  Normal: {
    name: "No clear signs",
    about: "The photo did not show clear signs of the conditions this tool looks for.",
    seek: "A photo scan cannot rule anything out. Keep up regular eye exams.",
    looksLike: "a clear, evenly colored white of the eye and normal-looking eyelids",
    habits: [],
  },
  Cataract: {
    name: "Cataract-like clouding",
    about: "A cataract is a clouding of the lens inside the eye. It can cause blurry or dim vision, glare, and faded colors.",
    seek: "See an optometrist or ophthalmologist for an exam, especially if your vision has changed.",
    looksLike: "a cloudy or whitish area over the pupil",
    habits: [
      { title: "Cut down glare", body: "Wear sunglasses outdoors and use bright, well-aimed light for reading. Be careful driving at night if headlights dazzle you." },
      { title: "Keep it under review", body: "Cataracts usually change slowly. Note any new blur, halos or faded colors and mention them at your exam." },
    ],
  },
  Conjunctivitis: {
    name: "Conjunctivitis (pink eye)",
    about: "Inflammation of the clear layer over the white of the eye, causing redness, watering, or a gritty feeling. Some types are contagious.",
    seek: "Wash your hands often and avoid rubbing your eyes. See a doctor if you have pain, light sensitivity, changes in vision, or it is not improving.",
    looksLike: "widespread redness or pinkness across the white of the eye",
    habits: [
      { title: "Keep your hands clean", body: "Wash your hands often and avoid touching or rubbing your eyes. Some types spread easily." },
      { title: "Don't share what touches your eyes", body: "Use your own towels and pillowcases, and avoid eye makeup and contact lenses until a doctor says it is fine." },
      { title: "Soothe the discomfort", body: "A clean, cool or warm damp cloth over closed eyes can ease irritation." },
    ],
  },
  Uveitis: {
    name: "Red eye (possible inflammation)",
    about: "A very red eye can come from several causes, including inflammation inside the eye or bleeding on its surface.",
    seek: "If the redness comes with pain, light sensitivity, or blurred vision, get checked promptly.",
    looksLike: "a deeply red eye, sometimes with a visible patch of bleeding",
    habits: [
      { title: "Don't wait on pain or blur", body: "Redness with pain, light sensitivity or blurred vision should be seen promptly." },
      { title: "Protect the eye", body: "Avoid rubbing it, skip contact lenses, and wear sunglasses if light bothers you." },
    ],
  },
  "Eyelid drooping": {
    name: "Eyelid condition (lump or drooping)",
    about: "A drooping eyelid or a lump on the lid. This group in the training data was mostly eyelid lumps.",
    seek: "See an eye professional if it is new, painful, growing, or affecting your vision.",
    looksLike: "a drooping lid or a lump on the eyelid",
    habits: [],
  },
  Stye: {
    name: "Stye",
    about: "A tender red bump at the edge of the eyelid, caused by a blocked or infected oil gland. Many clear up on their own in a week or two.",
    seek: "Warm compresses can help. See a doctor if it is very painful, spreads, affects your vision, or lasts more than a couple of weeks.",
    looksLike: "a red, swollen bump at the edge of the eyelid",
    habits: [
      { title: "Warm compresses", body: "Hold a clean, warm (not hot) damp cloth on the closed lid for about 10 minutes, a few times a day." },
      { title: "Hands off", body: "Don't squeeze or pop it, and skip eye makeup and contact lenses until it clears." },
    ],
  },
  Blepharitis: {
    name: "Blepharitis (eyelid inflammation)",
    about: "Inflammation of the eyelid edges that can cause red, itchy, crusty or swollen lids. It is common and usually long-lasting.",
    seek: "Regular lid hygiene often helps. An optometrist can confirm it and suggest treatment if it keeps coming back.",
    looksLike: "red, swollen or crusty eyelid edges",
    habits: [
      { title: "Daily lid hygiene", body: "Warm compresses followed by gentle cleaning of the lash line with a lid cleanser can calm the lids." },
      { title: "Go easy on makeup", body: "Remove eye makeup fully each night and replace eye makeup regularly." },
    ],
  },
  Pterygium: {
    name: "Pterygium (surfer's eye)",
    about: "A fleshy growth on the white of the eye that can creep onto the clear cornea. It is linked to sun, wind and dust exposure.",
    seek: "Have an eye professional check it, especially if it grows or affects vision. Sunglasses and a hat help protect against it.",
    looksLike: "a fleshy pinkish growth on the white of the eye reaching toward the colored part",
    habits: [
      { title: "Block the sun and wind", body: "Wear wraparound sunglasses with UV protection and a brimmed hat outdoors." },
      { title: "Calm dry, irritated eyes", body: "Lubricating drops can help. Ask a pharmacist which kind suits you." },
    ],
  },
  Pinguecula: {
    name: "Pinguecula",
    about: "A small yellowish bump on the white of the eye, usually near the colored part. It is common and usually harmless.",
    seek: "Mention it at your next eye exam. See someone sooner if it is painful, growing, or very red.",
    looksLike: "a small yellowish raised spot on the white of the eye",
    habits: [
      { title: "Protect from UV, wind and dust", body: "Sunglasses with UV protection help stop it from growing or getting irritated." },
      { title: "Lubricate if it feels dry", body: "Artificial tears can ease the gritty feeling. Ask a pharmacist if unsure." },
    ],
  },
  Xanthelasma: {
    name: "Xanthelasma (yellow eyelid patches)",
    about: "Soft yellowish patches of fatty deposits on or near the eyelids. They do not harm vision but are sometimes linked to high cholesterol.",
    seek: "Mention it to a doctor, who may want to check your cholesterol.",
    looksLike: "yellowish patches on the eyelid skin",
    habits: [
      { title: "Check your cholesterol", body: "Ask your doctor about a cholesterol test, since these patches can be linked to it." },
      { title: "Eat for your heart", body: "A balanced diet with plenty of vegetables, fiber and healthy fats supports cholesterol and eye health." },
      { title: "Leave it alone", body: "Don't try to remove the patches at home. A doctor can discuss options if you want them treated." },
    ],
  },
};

export const conditionInfo = (raw: string): ConditionInfo | undefined => CONDITIONS[raw];
export const displayLabel = (raw: string) => CONDITIONS[raw]?.name ?? raw;
