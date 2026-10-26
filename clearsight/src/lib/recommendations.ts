import { interpretAcuity, snellen } from "./vision";
import type { Results } from "./results";
import { conditionInfo, displayLabel } from "./labels";

export type Urgency = "none" | "routine" | "soon" | "prompt";
export type Tone = "ok" | "watch" | "see";

export interface Tip {
  title: string;
  body: string;
}

export interface Score {
  label: string;
  value: string;
}

export interface Section {
  id: "acuity" | "color" | "scan" | "amsler" | "contrast" | "blink" | "near";
  title: string;
  tone: Tone;
  scores: Score[];
  summary: string;
  how: string;
  actions: string[];
}

export interface Plan {
  urgency: Urgency;
  headline: string;
  summary: string;
  sections: Section[];
  habits: Tip[];
  moreHabits: Tip[];
}

export const HABITS: Tip[] = [
  {
    title: "Take screen breaks",
    body: "Every 20 minutes, look at something about 20 feet away for 20 seconds (the 20-20-20 rule). It gives your focusing muscles a rest.",
  },
  {
    title: "Blink fully and often",
    body: "We blink less when focused on a screen, which dries the eyes. Make a point of blinking completely, especially while reading or gaming.",
  },
  {
    title: "Make your screen comfortable",
    body: "Match brightness to the room, reduce glare, and increase text size if you lean in to read. If bright screens bother you in dim rooms, dark mode can feel easier on the eyes.",
  },
  {
    title: "Set up your space",
    body: "Keep a monitor about an arm's length away with the top of the screen at or just below eye level, in good, even lighting.",
  },
  {
    title: "Keep exams regular",
    body: "Get a comprehensive eye exam at least every one to two years, or as often as your eye doctor recommends. Many eye conditions have no early symptoms.",
  },
];

const GENERAL_EXTRAS: Tip[] = [
  {
    title: "Wear UV-blocking sunglasses",
    body: "Look for sunglasses that block 99-100% of UV rays. Long-term sun exposure is linked to several eye problems.",
  },
  {
    title: "Feed your eyes",
    body: "Leafy greens, colorful vegetables and oily fish are commonly recommended as part of an eye-friendly diet. Not smoking and getting enough sleep help too.",
  },
  {
    title: "Rest before you rub",
    body: "Rubbing irritated eyes can make things worse. Try a clean cool compress or lubricating drops instead.",
  },
];

const rank: Record<Urgency, number> = { none: 0, routine: 1, soon: 2, prompt: 3 };
const NORMAL = /normal/i;

export function buildPlan(results: Results): Plan {
  let urgency: Urgency = "none";
  const raise = (u: Urgency) => {
    if (rank[u] > rank[urgency]) urgency = u;
  };
  const sections: Section[] = [];
  const moreHabits: Tip[] = [];

  const eyes = (["right", "left"] as const).flatMap((e) => (results.acuity?.[e] ? [{ eye: e, ...results.acuity[e]! }] : []));
  if (eyes.length) {
    raise("routine");
    const worst = eyes.reduce((a, b) => (b.logMAR > a.logMAR ? b : a));
    const info = interpretAcuity(worst.logMAR);
    const tone: Tone = info.band === "reduced" ? "see" : info.band === "borderline" ? "watch" : "ok";
    const summary: string[] = [info.message];
    const actions: string[] = [];

    if (info.band === "reduced") {
      raise("soon");
      actions.push("Book an eye exam soon. An optometrist can check whether glasses or contacts would help.");
    } else if (info.band === "borderline") {
      raise("soon");
      actions.push("Consider a routine eye exam to see whether a prescription would sharpen things.");
    } else {
      actions.push("Keep up regular eye exams to catch changes early.");
    }

    if (eyes.length === 2 && Math.abs(eyes[0].logMAR - eyes[1].logMAR) >= 0.2) {
      raise("soon");
      summary.push("Your two eyes scored noticeably differently, which is worth mentioning to an eye professional.");
    }

    const squinty = eyes.filter((e) => e.totalAnswers >= 4 && e.squintAnswers / e.totalAnswers >= 0.25);
    if (squinty.length) {
      raise("routine");
      summary.push(
        `The camera saw you squinting on ${squinty.map((e) => `${e.squintAnswers} of ${e.totalAnswers} answers (${e.eye} eye)`).join(" and ")}. Squinting briefly sharpens vision, so your score may be better than your true vision.`,
      );
      actions.push("Frequent squinting can mean you would benefit from a new or first prescription.");
      moreHabits.push({
        title: "Make text easier to read",
        body: "Since you squinted during the test, increase text size on your devices and use brighter, glare-free lighting until you have had an exam.",
      });
    }

    sections.push({
      id: "acuity",
      title: "Visual acuity",
      tone,
      scores: eyes.map((e) => ({
        label: `${e.eye === "right" ? "Right" : "Left"} eye`,
        value: `${snellen(e.logMAR)} (logMAR ${e.logMAR.toFixed(2)})`,
      })),
      summary: summary.join(" "),
      how:
        "You told us which way a letter E was facing. Letters got smaller after correct answers and larger after mistakes until your threshold settled. " +
        "Your camera measured your distance so each letter was the right size, and it checked that your other eye was closed.",
      actions,
    });
  }

  if (results.color) {
    const { correct, total, controlOk } = results.color;
    const missed = total - correct;
    let tone: Tone = "ok";
    let summary: string;
    const actions: string[] = [];
    if (!controlOk) {
      tone = "watch";
      summary = "The control plate was not read correctly, so this result is unreliable.";
      actions.push("Retake the test with your screen at full brightness, away from glare.");
    } else if (missed >= 2) {
      tone = "watch";
      raise("routine");
      summary = "You missed several plates, which can indicate a red-green color vision difference.";
      actions.push("An eye professional can confirm this with a clinical test.");
      moreHabits.push({
        title: "Use color accessibility settings",
        body: "Phones and computers have color-filter settings that can make reds and greens easier to tell apart. Labels and patterns can help with things like clothing and charts.",
      });
    } else if (missed === 1) {
      summary = "You missed one plate. That can happen by chance, so retake it in good light before reading anything into it.";
    } else {
      summary = "You read every plate, so there was no sign of a red-green color vision difference.";
    }
    sections.push({
      id: "color",
      title: "Color vision",
      tone,
      scores: [{ label: "Plates read", value: `${correct} of ${total}` }],
      summary,
      how: "Each dotted plate hides a number that is easiest to see with typical red-green color vision. A control plate that everyone should read checks your screen and lighting.",
      actions,
    });
  }

  const findings = results.scan?.findings;
  const top = findings?.[0];
  if (findings && top) {
    const info = conditionInfo(top.label);
    const pct = Math.round(top.probability * 100);
    const confident = top.probability >= 0.6;
    const flagged = confident && !NORMAL.test(top.label);
    const urgent = /uveitis/i.test(top.label);

    let tone: Tone = "ok";
    let summary: string;
    const actions: string[] = [];

    if (flagged) {
      tone = urgent ? "see" : "watch";
      raise(urgent ? "prompt" : "soon");
      summary = `The model thinks your photo most resembles: ${displayLabel(top.label).toLowerCase()} (${pct}%). ${info?.about ?? ""}`.trim();
      if (info) actions.push(info.seek);
      actions.push("This scan is experimental and can be wrong, but it is worth having checked by a professional.");
      for (const h of info?.habits ?? []) moreHabits.push(h);
    } else if (confident) {
      summary = `The model saw no clear signs of the conditions it looks for (${pct}% confident). That is not a clean bill of health, since a photo cannot show everything.`;
      actions.push("Keep up regular eye exams, and see someone if you notice pain, redness, or changes in vision.");
    } else {
      tone = "watch";
      summary = `The scan was inconclusive: its top guess was ${displayLabel(top.label).toLowerCase()} at only ${pct}%.`;
      actions.push("Try again with a sharp, well-lit close-up of one eye, with the eye open and no flash glare.");
    }

    const looks = info?.looksLike;
    sections.push({
      id: "scan",
      title: "Eye photo scan",
      tone,
      scores: findings.slice(0, 3).map((f) => ({ label: displayLabel(f.label), value: `${Math.round(f.probability * 100)}%` })),
      summary,
      how:
        "The scan is a small neural network trained on about 3,300 labeled photos of eyes collected from the web. It compares overall patterns in your photo, such as color, redness and the shape of the eyelid and eye surface, with those examples" +
        (looks ? `. Training photos labeled “${displayLabel(top.label)}” typically show ${looks}` : "") +
        `, and your photo scored ${pct}% for that group. ` +
        "It cannot point to a specific spot, cannot see inside the eye, and many labels were not clinically verified, so lighting, camera and skin tone can all throw it off.",
      actions,
    });
  }

  if (sections.length) raise("routine");

  if (results.amsler && (results.amsler.right !== undefined || results.amsler.left !== undefined)) {
    const eyesA = (["right", "left"] as const).flatMap((e) => (results.amsler![e] !== undefined ? [{ eye: e, n: results.amsler![e]! }] : []));
    const any = eyesA.some((e) => e.n > 0);
    if (any) raise("soon");
    else raise("routine");
    sections.push({
      id: "amsler",
      title: "Amsler grid",
      tone: any ? "see" : "ok",
      scores: eyesA.map((e) => ({ label: `${e.eye === "right" ? "Right" : "Left"} eye`, value: e.n === 0 ? "All lines straight" : `${e.n} area${e.n === 1 ? "" : "s"} marked` })),
      summary: any
        ? "You reported wavy, blurry or missing lines in your central vision."
        : "You reported no wavy, blurry or missing lines in your central vision.",
      how: "You looked at a center dot with one eye and marked any squares where the grid lines looked distorted. Distortion here can point to a problem in the center of the retina, so this is a self-check, not a measurement.",
      actions: any
        ? ["Have your central vision checked soon. New distortion should not wait for a routine exam."]
        : ["Repeat the grid now and then, especially if you ever notice lines looking bent in daily life."],
    });
  }

  if (results.contrast && (results.contrast.right !== undefined || results.contrast.left !== undefined)) {
    const eyesC = (["right", "left"] as const).flatMap((e) => (results.contrast![e] !== undefined ? [{ eye: e, v: results.contrast![e]! }] : []));
    const worst = Math.min(...eyesC.map((e) => e.v));
    const tone: Tone = worst >= 1.65 ? "ok" : worst >= 1.35 ? "watch" : "see";
    raise(worst < 1.35 ? "soon" : "routine");
    sections.push({
      id: "contrast",
      title: "Contrast sensitivity",
      tone,
      scores: eyesC.map((e) => ({ label: `${e.eye === "right" ? "Right" : "Left"} eye`, value: `${e.v.toFixed(2)} log CS` })),
      summary:
        worst >= 1.65
          ? "Your ability to see faint letters is in the typical range."
          : worst >= 1.35
            ? "Your contrast sensitivity was slightly reduced. Dim light and glare may be harder than usual."
            : "Your contrast sensitivity was reduced, which can make dim light, fog and glare harder.",
      how: "Large letters faded from dark to faint in steps, and your score is the faintest line where you got at least two of three letters right. It depends on screen brightness and glare, so it is a rough screening.",
      actions: worst >= 1.65 ? ["Keep up regular eye exams."] : ["An eye exam can look for causes such as cataracts, and glasses or better lighting can help."],
    });
    if (worst < 1.65) {
      moreHabits.push({
        title: "Light up your reading",
        body: "Use brighter, glare-free lighting for reading and tasks, take extra care driving at night or in fog, and wear sunglasses against glare outdoors.",
      });
    }
  }

  if (results.blink) {
    const { perMin, blinks, seconds } = results.blink;
    const low = perMin < 8;
    const mid = perMin >= 8 && perMin < 15;
    raise("routine");
    sections.push({
      id: "blink",
      title: "Blink & strain",
      tone: low ? "watch" : mid ? "watch" : "ok",
      scores: [{ label: "Blink rate", value: `${perMin} per minute` }],
      summary: low
        ? "You blinked rarely while reading, which is linked to dry, tired eyes."
        : mid
          ? "Your blink rate was a bit low for a rested eye, which is common while reading or using screens."
          : "Your blink rate was in a typical range.",
      how: `Your camera counted ${blinks} blinks over ${seconds} seconds of reading and scaled that to a minute. Webcams can miss quick or partial blinks, so the real number may be higher.`,
      actions: low || mid ? ["Try the 20-20-20 rule and consciously blink fully while reading."] : ["Keep taking regular screen breaks."],
    });
    if (low || mid) {
      moreHabits.push({
        title: "Keep your eyes moist",
        body: "Blink fully, keep screens slightly below eye level, avoid fans blowing at your face, and ask a pharmacist about lubricating drops if your eyes feel dry.",
      });
    }
  }

  if (results.near) {
    const v = results.near.logMAR;
    const tone: Tone = v <= 0.3 ? "ok" : "watch";
    raise(v > 0.3 ? "soon" : "routine");
    sections.push({
      id: "near",
      title: "Near vision",
      tone,
      scores: [{ label: "Smallest line read at ~40 cm", value: `${snellen(v)} (logMAR ${v.toFixed(2)})` }],
      summary:
        v <= 0.3
          ? "You read small print at reading distance without trouble."
          : "Small print was hard to read at reading distance. This is common from about age 40 (presbyopia) and often easy to correct.",
      how: "Lines of letters were sized to your camera-measured reading distance, and you picked the smallest line you could read clearly.",
      actions: v <= 0.3 ? ["Keep up regular eye exams."] : ["An eye exam can check whether reading glasses would help."],
    });
    if (v > 0.3) {
      moreHabits.push({
        title: "Make close work easier",
        body: "Use good lighting, increase text size on your devices, and hold reading material at a comfortable distance until you have had an exam.",
      });
    }
  }

  const headline: Record<Urgency, string> = {
    none: "Take a test to get personalized guidance.",
    routine: "Nothing urgent. Keep up regular checks.",
    soon: "An eye exam is worth booking soon.",
    prompt: "Please see an eye professional promptly.",
  };
  const summary: Record<Urgency, string> = {
    none: "Complete the acuity test, color vision test or photo scan and your guidance will appear here.",
    routine: "Your results did not raise strong concerns. Healthy habits and regular exams are the best next step.",
    soon: "At least one result was outside the typical range. A professional exam can confirm what is going on.",
    prompt: "A result suggests something that should be looked at by a professional rather than monitored at home.",
  };

  return {
    urgency,
    headline: headline[urgency],
    summary: summary[urgency],
    sections,
    habits: HABITS,
    moreHabits: sections.length ? [...moreHabits, ...GENERAL_EXTRAS] : [],
  };
}
