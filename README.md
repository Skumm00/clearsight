<img width="1440" height="773" alt="Screenshot 2026-10-26 at 6 48 40 PM" src="https://github.com/user-attachments/assets/de44cfdd-4ad7-4824-989a-e59d7352c729" />
# ClearSight

ClearSight is a free website that lets you check your vision at home and scan a photo of your eye for possible problems. It uses your webcam to measure how far you are from the screen, and a credit card to measure the screen itself, so every test is the right size.

It is a first check, not a diagnosis. It does not replace an eye doctor.

## Who it is for

People who can't easily get to an eye doctor, because of cost or scheduling. It is meant to help catch problems early and to show when it is time to book an exam. Our target audience are young people who may suffer eye related problems and not know it, as well as the elderly.

## What it does

- **Letter test (visual acuity).** Tests each eye, one at a time, and gives a score like 20/25. Letters are sized to your real distance, and the test flags squinting.
- **Color vision test.** Dotted plates with hidden numbers.
- **Amsler grid.** Checks your central vision for wavy or missing lines.
- **Contrast sensitivity.** Letters that fade into the background.
- **Blink and strain.** Counts how often you blink while you read.
- **Near vision.** Finds the smallest print you can read up close.
- **Eye photo scan.** Upload a close-up photo of an eye, and an AI model lists possible signs and how sure it is.
- **Results page.** Shows your scores, explains how each one was reached, gives tips for your eyes, and lists eye doctors nearby.

## How to use it

1. Open the site in **Chrome** on a computer with a webcam.
2. Click **Start full screening**.
3. **Calibrate.** Hold a credit card to the screen and match the frame. Then sit 60 cm (about two feet) from the screen, measured with a tape. If the distance shown is wrong, adjust it with the + and − buttons.
4. Turn your screen brightness all the way up.
5. Take the letter test. Close the eye you aren't testing. Answer by voice (say "up," "down," "left," or "right") or with the arrow keys.
6. Take the color test, then upload a close-up eye photo for the scan.
7. Read your results page. You can also take any single test from the home page.

## Run it on your computer

You need [Node.js](https://nodejs.org) installed.

```bash
cd clearsight
npm install
npm run dev
```

Then open http://localhost:3000 in Chrome. Use `localhost`, not a network address, so the camera and microphone work. Allow camera access when asked. The microphone is only needed for voice answers.

## Privacy

Camera video and eye photos are processed in your browser and are never uploaded. Voice answers use your browser's speech tool, which in Chrome sends the audio to Google to turn it into text. The eye-care finder uses your location or ZIP code only to look up nearby clinics.

## What is in this repo

- `clearsight/` is the website.
- `ml/` has the scripts used to train the eye photo model.
