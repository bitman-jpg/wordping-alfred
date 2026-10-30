[简体中文](README.md) | [English](README.en.md)

# WordPing — Alfred translation and dictionary for Mac

Look up a word, hear it, save it, and review it later, all from Alfred. Get results from Youdao, iCiba, Baidu, MyMemory, Apple Translation, and Wiktionary, **without obtaining API keys**. This guide starts with the shortest route to a useful daily habit. **Press play on a video to watch its demo.**

## Start in two minutes

1. Install the latest [WordPing workflow](https://github.com/bitman-jpg/wordping-alfred/releases/latest) in Alfred 5.5 or later with Powerpack. WordPing requires an Apple silicon Mac. Web lookups need an internet connection.
2. In the workflow setup, choose your **native language** and **learning language**, then choose **American**, **British**, or **Both** for online pronunciation. You can change these later in Alfred Preferences.
3. Open Alfred and type `wp hello` (or a word in your learning language). Press **Return** on a result to copy its full translation.
4. Press **⌃ Return** on a result you want to remember. Type `wp :review` to practice it.

https://github.com/user-attachments/assets/1d244843-a647-483a-9f07-dd7ef6c483ba

*Watch: configure WordPing (14 seconds).*

## Look up a word or selected text

Type `wp ` followed by a word, phrase, or sentence. WordPing shows a row for each responding provider. Translation availability varies by language pair and provider.

https://github.com/user-attachments/assets/0a491372-d726-4364-9c34-8f7b99369a07

*Watch: find a word (10 seconds).*

To translate text in another Mac app, select it, then use WordPing's Alfred hotkey. To set up the demo's double-tap **⌥ Option** shortcut, open the workflow in Alfred Preferences, double-click **Hotkey Trigger**, set its hotkey to double-tap Option, and set **Argument** to **Selection in macOS**. If Alfred cannot read selected text, allow it in **System Settings → Privacy & Security → Accessibility**.

Use `wp` by itself to reopen a recent lookup. To erase recent lookups, type `wp :clear`.

## Explore results

The selected provider row has several useful actions:

| Keys | Action |
| --- | --- |
| **Return** | Copy the complete translation or meanings. |
| **⌘L** | Read a long result in Alfred's Large Type view. |
| **⌘ Return** | Hear the source word with a Mac voice. |
| **⌥ Return** | Hear online pronunciation; **Both** plays British, then American. |
| Hold **⌥ Option** | Show phonetics or pinyin where a dictionary provides them. |
| Hold **Shift** | Preview the selected web provider's page with Quick Look. |
| **⌃ Return** | Save the word for review. |

https://github.com/user-attachments/assets/b208655d-feaa-46a4-8ddd-1e5c57dc83f2

*Watch: explore multiple provider results and preview pages (41 seconds).*

Long translations are shortened in the result row, with a **⌘L** hint. **⌘L** opens the whole text; **Return** copies the whole text even when the row is shortened.

https://github.com/user-attachments/assets/4fd0375c-6b61-46b1-a19d-8b1c3799c46b

*Watch: read a complete translation (10 seconds).*

### Hear and read pronunciation

To hear the pronunciation in the demos below, click the player’s speaker icon to **unmute** the video.

**⌘ Return: Mac voice**

https://github.com/user-attachments/assets/b191c27a-92c3-4d1b-af0c-6f7128a0f524

**⌥ Return: Online audio** (British, then American when you choose **Both**)

https://github.com/user-attachments/assets/fe029d76-f937-4c53-827a-3d9470723b69

**Hold ⌥ Option: Show phonetics or pinyin**

https://github.com/user-attachments/assets/6b8fc2d0-d67a-4984-bf68-c6933692bd7e

Phonetics appear only on results whose dictionary supplies them. Online audio uses the pronunciation choice in the workflow setup.

## Choose a translation direction

WordPing normally uses your **native language** and **learning language** to choose a direction: text in your learning language goes to your native language, while text in your native language goes to your learning language. For other languages, it aims at your native language. For example, if your native language is Chinese and you are learning English, looking up the Chinese phrase “你说啥” produces English results, marked `zh→en` in this image.

![Chinese input translated into English by default](demo-clips/3%20tranlation%20learning%20language%20to%20native%20language.png)

To use another direction, such as **English directly to Korean**, prefix your query with `source>destination`: `wp en>ko awesome`. You can also type `wp es>zh trabajo` for Spanish to Simplified Chinese. `zh` means Simplified Chinese; `tw` or `zh-TW` means Traditional Chinese. A manual direction stays fixed even if a provider has no result.

![Choose English-to-Korean translation manually](demo-clips/5-change%20direction.png)

## Build a word list

On a lookup result, press **⌃ Return** to save the word and its translation. Saving the same word again resets its review progress and makes it due now.

![Save a word with Control Return](demo-clips/7%20save%20a%20word.png)

Type `wp :words` for the saved-word menu, or go directly to `wp :saved` to browse. Add text after `:saved` to search words **and** their translations. On a saved word, **⌃ Return** removes it permanently.

**Browse saved words:** `wp :saved`

https://github.com/user-attachments/assets/2eb44974-f001-41d5-91dc-ca06d14f2d2c

**Search words and translations:** `wp :saved text`

https://github.com/user-attachments/assets/40a15341-9836-4a47-9531-badf475ea13d

## Review in short sessions

Type `wp :review` to start or resume a session of up to 10 due words. Read the prompt, press **Return** to reveal the translation, then choose **Got it** or **Missed it**. **⌘ Return** speaks the word before you reveal it. A missed word comes back once at the end of that session. Your next reviews are scheduled after 1, 3, 7, 14, 30, and 60 days as you keep remembering a word.

https://github.com/user-attachments/assets/0dc6dc62-4e04-4a8f-a981-d7224f7ee651

*Watch: review saved words (21 seconds).*

To test recall the other way, type `wp :reverse`. You see the translation and try to remember the saved word. Type a space and your answer, then press **Return** on **Check**; you can accept or change the suggested grade. You can also press **Return** immediately to reveal the word and grade yourself. Both review directions share one schedule.

https://github.com/user-attachments/assets/6373069b-21b5-488e-8e45-259051ffa239

*Watch: reverse review (26 seconds).*

For a daily prompt, type `wp :remind 09:00` using any 24-hour local time. WordPing sends a notification only when words are due. Type `wp :remind` to see the schedule or turn it off.

https://github.com/user-attachments/assets/0113bbbb-82af-4a66-a4ce-e50864644901

*Watch: set a review reminder (17 seconds).*

## Keep or move your words

Type `wp :files` to see the three word-list actions:

| Command | What it creates or does |
| --- | --- |
| `wp :backup` | Save a restorable JSON backup in Downloads, including all language pairs and review progress. It replaces an older backup with the same name. |
| `wp :restore` | Merge `WordPing Vocabulary Backup.json` from Downloads, keeping existing words and progress. You can also enter a full file path after `:restore`. |
| `wp :export` | Save a CSV in Downloads for the current language pair, without review progress. |

https://github.com/user-attachments/assets/83b68931-c1c7-4955-8cb7-286e9a068cb3

*Watch: open word management (6 seconds).*

## Updates and useful extras

Type `wp :update` to check GitHub Releases. If a newer version appears, press **Return** to download it and open Alfred's installation window. Your settings and saved words stay in Alfred's workflow data.

https://github.com/user-attachments/assets/da6b321b-c97d-4db4-8254-377ce1943fbc

*Watch: update WordPing (28 seconds).*

- If an English word is misspelled, choose a **Did you mean…?** suggestion and press **Tab** to retry the corrected word.
- Open `wp :` to discover commands without memorizing them.
- In Alfred's workflow configuration, choose which providers are enabled and how many recent lookups to keep. Some dictionaries only return results for single words.

### Optional Apple Translation

If you want an on-device Apple Translation result, use macOS 26 or newer and download both languages for the pair: **System Settings → General → Language & Region → Translation Languages**. WordPing uses installed languages only; it does not prompt to download them. If they are missing, that result is simply absent and the other providers can still respond. Installing a released workflow does not require Xcode or its Command Line Tools.

## Privacy and data

WordPing sends lookup text to each enabled web provider. Wiktionary results come through FreeDictionaryAPI.com; Apple Translation runs on-device. Recent lookups, saved words, and review progress are stored locally in Alfred's workflow data. JSON vocabulary backups contain saved words and review progress but no credentials. Dictionary attribution and licenses are in [THIRD_PARTY_DICTIONARIES.md](THIRD_PARTY_DICTIONARIES.md).

## Support WordPing

Questions, bug reports, and ideas are welcome in [GitHub Issues](https://github.com/bitman-jpg/wordping-alfred/issues).

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
