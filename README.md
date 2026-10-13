# Alfred WordPing

Ping a word. Learn it—in your language.

WordPing is a fast translation and dictionary workflow for Alfred. Choose your native language and the language you're learning, then look up words in either direction without leaving Alfred. English is optional.

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
- Reopen recent lookups and reuse cached translations without another API call.
- Save words into a personal vocabulary list and review them when due.

## Requirements

- An Apple silicon Mac
- Alfred with the Powerpack
- A Youdao AI Cloud app key and secret

## Install

1. Download the latest `.alfredworkflow` file from GitHub Releases.
2. Open the downloaded file to install WordPing in Alfred.
3. Enter your Youdao app key and secret in the setup window.
4. Choose your native and learning languages. English is the default learning language.
5. Choose **American**, **British**, or **Both (British, then American)** for online pronunciation. American is the default.

To obtain credentials, create a Natural Language Translation application in [Youdao AI Cloud](https://ai.youdao.com/), then copy its app key and secret into WordPing.

Existing YoudaoTranslator users can reuse the same app key and secret. Enter them once in WordPing because Alfred keeps each workflow's settings separately.

## Translate with Alfred

Open Alfred and type `wp` followed by a word or phrase:

```text
wp hello
wp 你好
wp bonjour
```

Input in your learning language is translated into your native language, and native-language input goes the other way. Other detected languages go to your native language. If Youdao cannot identify the source language, WordPing may show both directions with labeled results.

Activate `wp` without entering a lookup to see recent history. Type `wp :clear` and press Return on **Clear recent lookups…** to delete local history without scrolling. Repeating a lookup uses its cached result, reducing latency and Youdao API usage. The maximum number of saved lookups can be changed in the workflow configuration.

Press `Control-Return` on a translation to save it. Saving an existing word resets its review progress and makes it due now. Use `wp :saved` to browse saved vocabulary and `wp :export` to export it as CSV. Use `wp :review` to see words due now. Press Return on a word to reveal its translation, then choose **Got it** if you recalled it or **Missed it** if you did not. Alfred returns to the review list after either choice. Got it schedules the next review after 1, 3, 7, 14, 30, then 60 days as you keep succeeding. Missed it resets that progress and keeps the word in the due list, after other due words. The `wp :` menu shows how many words are due. In both saved and review views, `Control-Return` removes the word permanently and refreshes that list.

The colon marks a WordPing command. Without it, `wp saved`, `wp review`, `wp clear`, and `wp export` are ordinary lookups. Type `wp :` to see all commands. Unknown colon commands and review phrases that do not match a saved word fall back to normal lookup.

## Translate selected text

You can select text in Safari, Notes, a PDF reader, or another Mac application and open its translation by double-tapping `⌥ Option`.

Alfred requires you to assign workflow hotkeys after installation:

1. Open WordPing in Alfred Preferences.
2. Double-click its **Hotkey Trigger**.
3. Set **Hotkey** to double-tap `⌥ Option`.
4. Set **Argument** to **Selection in macOS**.
5. Make sure the Hotkey Trigger is connected to the translation **Script Filter**.

To disable this feature, clear the shortcut in the Hotkey Trigger. If WordPing cannot read selected text, allow Alfred under **System Settings → Privacy & Security → Accessibility**.

## Keyboard shortcuts

After selecting a WordPing result:

| Shortcut | Action |
| --- | --- |
| `Return` | Copy the selected translation. |
| `⌘ Return` | Speak the English word or translation with the Mac voice. |
| `⌥ Return` | Play your selected Youdao online pronunciation. |
| `⌃ Return` | Save a lookup, or remove a word from saved vocabulary. |
| `Shift` | Preview the word's Youdao dictionary page. |

When **Both** pronunciation is selected, `⌥ Return` plays British followed by American.

## Privacy

WordPing sends lookup text to Youdao using your own API account. It does not include shared credentials. Recent lookup text and results are cached locally in Alfred's workflow cache directory; use `wp :clear` to delete them.

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
