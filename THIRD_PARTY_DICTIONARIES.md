# Dictionary data and attribution

The WordPing code is MIT licensed. Live Wiktionary entries have a separate license:

- **Wiktionary live entries**, © Wiktionary contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), served by [FreeDictionaryAPI.com](https://freedictionaryapi.com/). WordPing labels these results as Wiktionary in Alfred; available translations appear directly in the results list.

Offline dictionary data has its own license:

- **System Oxford**: dictionaries installed through macOS Dictionary, licensed separately by Apple/Oxford. WordPing reads local definitions through Dictionary Services and includes no Oxford data.
- **ECDICT**, © skywind3000 and contributors, [MIT licensed](https://github.com/skywind3000/ECDICT/blob/master/LICENSE). WordPing does not redistribute ECDICT. The `wp :dictionaries` command downloads `ecdict.csv` from the project's GitHub repository and creates a local index.
- **CC-CEDICT**, © CC-CEDICT contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). WordPing does not redistribute CC-CEDICT. The `wp :dictionaries` command downloads the current MDBG export from [the CC-CEDICT download page](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) and creates a local index.
