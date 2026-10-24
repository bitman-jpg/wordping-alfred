# WordPing — Alfred translation and dictionary workflow for Mac

Translate words in Alfred, save vocabulary, and review it later.

WordPing is an Alfred workflow for fast word lookup and translation on Mac. Translate in either direction between your native and learning languages, see dictionary definitions and pronunciation, then save words for spaced review. English is optional.

For example, an English speaker learning French can look up `bonjour` in English or `hello` in French. A Chinese speaker learning English can look up `nasa` in Chinese or `你好` in English. WordPing offers 17 language choices; translation availability depends on Youdao.

## Features

- Choose your native and learning languages instead of being locked to English.
- Translate between your chosen languages in both directions.
- Translate other detected languages into your native language.
- Show translations, short definitions, and alternatives when available.
- Copy translations with one key.
- Hear local or online pronunciation.
- Choose American, British, or both pronunciations.
- Translate text selected in other Mac applications.
- Preview the full Youdao dictionary page with Quick Look.
- Reopen recent lookups.
- Save words to your own list and review them when due.
- Practice recall in either direction, with optional typed answers in reverse review.
- Set an optional daily notification when saved words are due for review.

## Requirements

- An Apple silicon Mac
- Alfred 5.5 or newer with the Powerpack
- An internet connection for new lookups
- Xcode Command Line Tools if building from source

## Install

1. Build this version with `sh scripts/build.sh`, then open the `.alfredworkflow` file in `release/` with Alfred. The current [public release](https://github.com/bitman-jpg/wordping-alfred/releases) uses Youdao AI Cloud credentials.
2. Choose your native and learning languages. English is the default learning language.
3. Choose **American**, **British**, or **Both (British, then American)** for online pronunciation. American is the default.

No API key or account is needed for this version.

## Look up and translate

Open Alfred and type `wp` followed by a word or phrase:

```text
wp hello
wp 你好
wp bonjour
```

- A word in your learning language is translated into your native language; a word in your native language goes the other way.
- Other detected languages are translated into your native language.
- If Youdao cannot identify the source language, WordPing may show both directions with labeled results.
- Results can include short definitions and alternative translations when available.
- For a single word with dictionary meanings, choose **Show full entry** to see all supplied meanings, pronunciation, pinyin, exam labels, word forms, and any examples in a larger view.
- If a translation fails for a word that has a dictionary entry, press Return on the offered link to open that entry in your browser.
- For English–Chinese lookups that Youdao cannot translate, WordPing first tries Apple's on-device Translation framework on macOS 26 or newer when its language models are installed. If Apple Translation is unavailable, WordPing tries MyMemory. The result is labeled with its provider; if neither translates it, WordPing offers a link to the Youdao dictionary page.
- On macOS 26 or newer, manage downloaded language models in **System Settings → General → Language & Region → Translation Languages**. Apple Intelligence may already provide a model for your language pair.

### Actions on a lookup result

- **Return:** Copy the selected translation.
- **⌘ Return:** Speak the word with a Mac voice.
- **⌥ Return:** Play Youdao's online pronunciation. With **Both** selected, it plays British followed by American.
- **⌃ Return:** Save the word to your list.
- **Shift:** Preview the full Youdao dictionary page with Quick Look.
- **Return on Show full entry:** Open the word's detailed view in Alfred.

### WordPing commands

- Type `wp :` to see **Saved words…** and **Clear recent lookups**. Choose **Saved words…** (`wp :words`) for review, browse, reminders, and files; choose **Manage saved words…** for backup, restore, and export.
- The colon distinguishes a command from a lookup: `wp review` searches for “review,” while `wp :review` starts a review. Direct commands such as `wp :review` still work.
- Type an unrecognized colon command to look it up as ordinary text.

## Translate selected text

Select text in Safari, Notes, a PDF reader, or another Mac app, then double-tap **⌥ Option** to open its translation.

Set up the hotkey after installing WordPing:

1. Open WordPing in Alfred Preferences and double-click its **Hotkey Trigger**.
2. Set **Hotkey** to double-tap **⌥ Option**.
3. Set **Argument** to **Selection in macOS**.
4. Check that the Hotkey Trigger is connected to the translation **Script Filter**.

- To disable selected-text translation, clear the shortcut in the Hotkey Trigger.
- If WordPing cannot read selected text, allow Alfred under **System Settings → Privacy & Security → Accessibility**.

## Recent lookups

- Open Alfred and type `wp` alone to browse recent lookups.
- Opening `wp` prepares the translator in the background. No lookup text is sent until you enter one.
- Repeating a lookup shows the saved result. Alfred waits 500 ms after typing stops before running the lookup script.
- Change the maximum number of saved lookups in the workflow configuration.
- To delete local lookup history, type `wp :clear` and press Return on **Clear recent lookups…**.

To receive a macOS notification when WordPing detects possible session expiry, open its configuration in Alfred and set **Developer mode** to **On**. It is off by default. Diagnostic events are saved at `~/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.bitman.wordping/website-session-key-events.json`; the file keeps the latest 200 events.

## Saved words

### Save and find words

- Press **⌃ Return** on a lookup result to save it. Saving an existing word resets its review progress and makes it due now.
- Type `wp :saved` to browse your saved words.
- Type `wp :saved` followed by text to search saved words and their translations.
- Press **⌃ Return** on a word in the saved words or review view to remove it permanently.

### Review translations

1. Type `wp :review` to start or resume a session of up to 10 due words.
2. Read the saved word. Press **⌘ Return** to hear it without revealing the translation.
3. Press Return to reveal its translation.
4. Press Return again for **Got it**, or press Down then Return for **Missed it**. The translations remain below these choices.

- Alfred shows the next word and your progress after each grade.
- At the end, the summary offers another batch if more words are due.
- If none are due, WordPing shows the next review date and time. The **Saved words…** menu shows the due count.

### Review in reverse

1. Type `wp :reverse` to see a translation and recall the saved word.
2. Type a space and your answer after `:reverse`, then press Return on **Check**.
3. A match puts **Got it** first; a different answer puts **Missed it** first. Press Return to accept that grade, or choose the other grade.

- For a quick self-graded card, press Return on the initial prompt to reveal the saved word without typing.
- Both review directions use the same saved words and review schedule.

### Review schedule

- Each **Got it** schedules the next review after 1, 3, 7, 14, 30, then 60 days as you keep succeeding.
- A missed word returns once at the end of the session. If missed again, it remains due for a future session.

### Daily reminder

- Type `wp :remind 09:00` to set a daily reminder at 9:00 AM local time. Use any 24-hour `HH:MM` time.
- WordPing notifies you only when words are due; the notification tells you to open `wp :review`.
- Type `wp :remind` to see the current time, refresh the schedule, or turn the reminder off. Reminders are off until you set one.
- Reminders use `~/Library/LaunchAgents/com.bitman.wordping.review.plist`. If your Mac is asleep at the scheduled time, macOS runs the job when it wakes.

### Back up saved words

- Type `wp :backup` to save a complete JSON backup in Downloads.
- It includes all language pairs, translations, and review progress.
- The file is named `WordPing Vocabulary Backup.json`. A new backup replaces the previous one, so move or rename older copies you want to keep.

### Restore saved words

- Copy the JSON backup to Downloads on another Mac, type `wp :restore`, and press Return.
- Restore adds missing entries while keeping existing saved words and progress.
- For a file elsewhere, type `wp :restore /path/to/backup.json`.

### Export saved words

- Type `wp :export` to create a CSV in Downloads for spreadsheets or flashcard apps.
- The CSV includes words, translations, and saved dates for the current language pair. It does not include review progress.

## Privacy

- WordPing sends lookup text to Youdao's website translation service. For an English–Chinese lookup rejected with code 50, it first tries Apple Translation on the Mac. If that is unavailable, it sends the text to MyMemory's translation API. No API credentials are used.
- Recent lookup text and results are stored locally. Use `wp :clear` to delete them.
- Saved words and review progress are stored in Alfred's workflow data directory.
- JSON backups contain saved words and review progress, but no credentials.

## Support WordPing

If WordPing helps you, consider supporting its continued development.

Choose a payment method below. For WeChat Pay or Alipay, scan the corresponding QR code:

<table>
  <tr>
    <th>PayPal</th>
    <th>WeChat Pay</th>
    <th>Alipay</th>
  </tr>
  <tr>
    <td align="center">
      <a href="https://www.paypal.com/donate/?hosted_button_id=BD9KXXA9NFBHC">
        <img src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif" alt="Donate with PayPal">
      </a>
    </td>
    <td><img src="assets/donate/wechat-pay.png" width="220" alt="Support WordPing with WeChat Pay"></td>
    <td><img src="assets/donate/alipay-small.png" width="220" alt="Support WordPing with Alipay"></td>
  </tr>
</table>

Thank you for supporting independent open source software.

## License

WordPing is available under the [MIT License](LICENSE).
