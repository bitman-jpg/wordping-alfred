# Alfred WordPing

Ping a word. Learn it.

WordPing is a fast translation and dictionary workflow for Alfred. Type a word or phrase, see its translation and definitions, copy the result, or hear its pronunciation without leaving Alfred.

## Features

- Translate English into your chosen native language.
- Translate other supported languages into English.
- Show translations, short definitions, phonetic spelling, and alternatives when available.
- Copy translations with one key.
- Hear local or online pronunciation.
- Choose American, British, or both pronunciations.
- Translate text selected in other Mac applications.
- Preview the full Youdao dictionary page with Quick Look.

## Requirements

- An Apple silicon Mac
- Alfred with the Powerpack
- A Youdao AI Cloud app key and secret

## Install

1. Download the latest `.alfredworkflow` file from GitHub Releases.
2. Open the downloaded file to install WordPing in Alfred.
3. Enter your Youdao app key and secret in the setup window.
4. Choose your native language.
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

English input is translated into your selected native language. Other supported languages are translated into English.

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
| `Shift` | Preview the word's Youdao dictionary page. |

When **Both** pronunciation is selected, `⌥ Return` plays British followed by American.

## Privacy

WordPing sends lookup text to Youdao using your own API account. It does not include shared credentials and does not save your lookup history.

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
