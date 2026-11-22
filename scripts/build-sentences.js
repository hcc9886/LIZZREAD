/* =====================================================================
   LIZZREAD —— 句子数据构建脚本（build-sentences.js）
   Node.js 运行：node scripts/build-sentences.js
   输入：books/*.txt + BOOKS 数组（硬编码在本脚本顶部）
   输出：sentences/bookXXXX.json + sentences/index.json
   ===================================================================== */

const fs = require("fs");
const path = require("path");

/* ---------- BOOKS 元数据（与 index.html 保持同步的精简版） ---------- */
const BOOKS_RAW = `
gb:11,book_id:book011
gb:12,book_id:book012
gb:16,book_id:book016
gb:23,book_id:book023
gb:24,book_id:book024
gb:26,book_id:book026
gb:30,book_id:book030
gb:33,book_id:book033
gb:36,book_id:book036
gb:41,book_id:book041
gb:43,book_id:book043
gb:44,book_id:book044
gb:45,book_id:book045
gb:46,book_id:book046
gb:55,book_id:book055
gb:60,book_id:book060
gb:61,book_id:book061
gb:62,book_id:book062
gb:64,book_id:book064
gb:73,book_id:book073
gb:76,book_id:book076
gb:77,book_id:book077
gb:83,book_id:book083
gb:84,book_id:book084
gb:86,book_id:book086
gb:88,book_id:book088
gb:95,book_id:book095
gb:98,book_id:book098
gb:102,book_id:book102
gb:103,book_id:book103
gb:107,book_id:book107
gb:108,book_id:book108
gb:113,book_id:book113
gb:121,book_id:book121
gb:122,book_id:book122
gb:128,book_id:book128
gb:1342,book_id:book1342
gb:139,book_id:book139
gb:140,book_id:book140
gb:141,book_id:book141
gb:143,book_id:book143
gb:1448,book_id:book1448
gb:1450,book_id:book1450
gb:14522,book_id:book14522
gb:14591,book_id:book14591
gb:146,book_id:book146
gb:147,book_id:book147
gb:148,book_id:book148
gb:1508,book_id:book1508
gb:1513,book_id:book1513
gb:1514,book_id:book1514
gb:1515,book_id:book1515
gb:1519,book_id:book1519
gb:1521,book_id:book1521
gb:1522,book_id:book1522
gb:1524,book_id:book1524
gb:1526,book_id:book1526
gb:153,book_id:book153
gb:1531,book_id:book1531
gb:1532,book_id:book1532
gb:1533,book_id:book1533
gb:15399,book_id:book15399
gb:1540,book_id:book1540
gb:155,book_id:book155
gb:158,book_id:book158
gb:159,book_id:book159
gb:1597,book_id:book1597
gb:16,book_id:book016b
gb:160,book_id:book160
gb:1608,book_id:book1608
gb:161,book_id:book161
gb:162,book_id:book162
gb:16328,book_id:book16328
gb:164,book_id:book164
gb:1661,book_id:book1661
gb:1727,book_id:book1727
gb:174,book_id:book174
gb:175,book_id:book175
gb:1787,book_id:book1787
gb:18247,book_id:book18247
gb:1837,book_id:book1837
gb:1874,book_id:book1874
gb:18857,book_id:book18857
gb:1906,book_id:book1906
gb:1952,book_id:book1952
gb:1974,book_id:book1974
gb:1998,book_id:book1998
gb:2000,book_id:book2000
gb:2009,book_id:book2009
gb:2017,book_id:book2017
gb:2021,book_id:book2021
gb:203,book_id:book203
gb:204,book_id:book204
gb:205,book_id:book205
gb:2055,book_id:book2055
gb:208,book_id:book208
gb:209,book_id:book209
gb:2097,book_id:book2097
gb:21,book_id:book021
gb:2130,book_id:book2130
gb:2148,book_id:book2148
gb:215,book_id:book215
gb:216,book_id:book216
gb:2166,book_id:book2166
gb:219,book_id:book219
gb:2197,book_id:book2197
gb:222,book_id:book222
gb:228,book_id:book228
gb:2281,book_id:book2281
gb:22865,book_id:book22865
gb:233,book_id:book233
gb:236,book_id:book236
gb:2376,book_id:book2376
gb:2383,book_id:book2383
gb:2388,book_id:book2388
gb:2397,book_id:book2397
gb:24,book_id:book024b
gb:242,book_id:book242
gb:244,book_id:book244
gb:2499,book_id:book2499
gb:2527,book_id:book2527
gb:2542,book_id:book2542
gb:2554,book_id:book2554
gb:2591,book_id:book2591
gb:2592,book_id:book2592
gb:25928,book_id:book25928
gb:2593,book_id:book2593
gb:2594,book_id:book2594
gb:2600,book_id:book2600
gb:2610,book_id:book2610
gb:2638,book_id:book2638
gb:2641,book_id:book2641
gb:2680,book_id:book2680
gb:27,book_id:book027
gb:2701,book_id:book2701
gb:271,book_id:book271
gb:2759,book_id:book2759
gb:2781,book_id:book2781
gb:2788,book_id:book2788
gb:28054,book_id:book28054
gb:2814,book_id:book2814
gb:2833,book_id:book2833
gb:284,book_id:book284
gb:285,book_id:book285
gb:2852,book_id:book2852
gb:2870,book_id:book2870
gb:289,book_id:book289
gb:2895,book_id:book2895
gb:29364,book_id:book29364
gb:2946,book_id:book2946
gb:3155,book_id:book3155
gb:3176,book_id:book3176
gb:3177,book_id:book3177
gb:32034,book_id:book32034
gb:3207,book_id:book3207
gb:3268,book_id:book3268
gb:3289,book_id:book3289
gb:3296,book_id:book3296
gb:3300,book_id:book3300
gb:3330,book_id:book3330
gb:345,book_id:book345
gb:34901,book_id:book34901
gb:351,book_id:book351
gb:376,book_id:book376
gb:3836,book_id:book3836
gb:394,book_id:book394
gb:408,book_id:book408
gb:416,book_id:book416
gb:421,book_id:book421
gb:4217,book_id:book4217
gb:4276,book_id:book4276
gb:4280,book_id:book4280
gb:432,book_id:book432
gb:4363,book_id:book4363
gb:44,book_id:book044b
gb:440,book_id:book440
gb:44747,book_id:book44747
gb:45631,book_id:book45631
gb:46333,book_id:book46333
gb:4650,book_id:book4650
gb:4807,book_id:book4807
gb:500,book_id:book500
gb:514,book_id:book514
gb:5200,book_id:book5200
gb:521,book_id:book521
gb:5230,book_id:book5230
gb:541,book_id:book541
gb:543,book_id:book543
gb:580,book_id:book580
gb:583,book_id:book583
gb:58585,book_id:book58585
gb:599,book_id:book599
gb:600,book_id:book600
gb:601,book_id:book601
gb:6130,book_id:book6130
gb:6133,book_id:book6133
gb:61407,book_id:book61407
gb:624,book_id:book624
gb:63107,book_id:book63107
gb:64317,book_id:book64317
gb:6688,book_id:book6688
gb:67098,book_id:book67098
gb:67138,book_id:book67138
gb:68283,book_id:book68283
gb:696,book_id:book696
gb:711,book_id:book711
gb:730,book_id:book730
gb:74,book_id:book074
gb:766,book_id:book766
gb:768,book_id:book768
gb:7986,book_id:book7986
gb:805,book_id:book805
gb:815,book_id:book815
gb:829,book_id:book829
gb:833,book_id:book833
gb:834,book_id:book834
gb:8438,book_id:book8438
gb:844,book_id:book844
gb:848,book_id:book848
gb:8492,book_id:book8492
gb:851,book_id:book851
gb:863,book_id:book863
gb:8800,book_id:book8800
gb:902,book_id:book902
gb:910,book_id:book910
gb:9182,book_id:book9182
gb:940,book_id:book940
gb:944,book_id:book944
gb:965,book_id:book965
gb:969,book_id:book969
gb:97,book_id:book097
gb:974,book_id:book974
gb:98,book_id:book098b
gb:9830,book_id:book9830
gb:996,book_id:book996
gb:10007,book_id:book10007
gb:1012,book_id:book1012
gb:1013,book_id:book1013
gb:1023,book_id:book1023
gb:103,book_id:book103b
gb:105,book_id:book105
gb:1056,book_id:book1056
gb:1074,book_id:book1074
gb:1080,book_id:book1080
gb:1081,book_id:book1081
gb:110,book_id:book110
gb:11030,book_id:book11030
gb:11231,book_id:book11231
gb:11339,book_id:book11339
gb:1156,book_id:book1156
gb:1164,book_id:book1164
gb:11757,book_id:book11757
gb:1184,book_id:book1184
gb:120,book_id:book120
gb:1232,book_id:book1232
gb:1237,book_id:book1237
gb:1257,book_id:book1257
gb:1259,book_id:book1259
gb:1260,book_id:book1260
gb:132,book_id:book132
gb:1322,book_id:book1322
gb:135,book_id:book135
gb:1399,book_id:book1399
gb:14,book_id:book014
gb:1400,book_id:book1400
gb:1404,book_id:book1404
gb:1497,book_id:book1497
gb:1508,book_id:book1508b
gb:1521,book_id:book1521b
gb:43,book_id:book043b
camus,book_id:camus
`;

/* ---------- 引入 assembly-core 的切分逻辑 ---------- */
const AssemblyCore = require(path.join(__dirname, "..", "shared", "assembly-core.js"));

/* ---------- PG 文本解析（修剪 Gutenberg 头尾） ---------- */
function trimPG(text){
  if(!text) return "";
  text = text.replace(/\r/g, "");
  // 找 START 标记
  const startRe = /\*\*\*.*?START OF THE PROJECT GUTENBERG[^\n]*\n/;
  const startM = text.match(startRe);
  if(startM) text = text.slice(startM.index + startM[0].length);
  // 也找 START: 标记变体
  const start2 = text.search(/^START OF THE PROJECT GUTENBERG/im);
  if(start2 > 0 && startM === null) text = text.slice(start2 + text.slice(start2).search(/\n/) + 1);
  // 找 END 标记
  const endRe = /\*\*\*.*?END OF THE PROJECT GUTENBERG[^\n]*\n/;
  const endM = text.match(endRe);
  if(endM) text = text.slice(0, endM.index);
  const end2 = text.search(/^END OF THE PROJECT GUTENBERG/im);
  if(end2 > 0) text = text.slice(0, end2);
  return text.trim();
}

/* ---------- 分句 ---------- */
function splitSentences(text){
  // 按段落切
  const paras = text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 10);
  const sents = [];
  paras.forEach(p => {
    // 按句号/问号/感叹号切，但保留 Mr./Mrs./Dr./e.g./i.e. 等缩写
    let cleaned = p
      .replace(/(Mr|Mrs|Ms|Dr|Prof|Capt|Hon|Rev|St|Sr|Jr)\./gi, "$1<<DOT>>")
      .replace(/(e\.g|i\.e|etc|viz|cf)\./gi, "$1<<DOT>>")
      .replace(/(\d)\.(\d)/g, "$1<<DOT>>$2");
    let parts = cleaned.split(/(?<=[.!?])\s+/).map(s => s.replace(/<<DOT>>/g, ".").trim());
    parts.forEach(s => {
      // 去掉引号包裹
      s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
      if(s.length > 15 && s.length < 500){
        sents.push(s);
      }
    });
  });
  return sents;
}

/* ---------- 读取本地 dict.js 获取 zh 翻译（可选） ---------- */
function loadDict(){
  try{
    const dictPath = path.join(__dirname, "..", "dict.js");
    const content = fs.readFileSync(dictPath, "utf-8");
    const m = content.match(/window\.LIZ_DICT=(\{[\s\S]*\})/);
    if(m) return JSON.parse(m[1]);
  }catch(e){}
  return null;
}

/* ---------- 词数统计 ---------- */
function countWords(s){
  return (s.match(/[A-Za-z']+/g) || []).length;
}

/* ---------- 主构建流程 ---------- */
function main(){
  const sentencesDir = path.join(__dirname, "..", "sentences");
  const booksDir = path.join(__dirname, "..", "books");
  if(!fs.existsSync(sentencesDir)) fs.mkdirSync(sentencesDir, {recursive:true});

  const dict = loadDict();
  const index = {};  // sentence_id → book_file 映射

  const bookEntries = BOOKS_RAW.trim().split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const [a, b] = l.split(",").map(x => x.trim());
      const gb = a.startsWith("gb:") ? parseInt(a.slice(3)) : null;
      const bookId = b.startsWith("book_id:") ? b.slice(8) : null;
      return { gb, bookId };
    })
    .filter(e => e.bookId);

  let totalSents = 0, totalBooks = 0;

  bookEntries.forEach(({ gb, bookId }) => {
    // camus 是特殊文件名
    let txtFile;
    if(bookId === "camus") txtFile = path.join(booksDir, "camus_stranger.txt");
    else if(gb) txtFile = path.join(booksDir, `pg${gb}.txt`);
    else txtFile = null;

    if(!txtFile || !fs.existsSync(txtFile)){
      console.log(`  ⚠️ 跳过 ${bookId}：文件不存在`);
      return;
    }

    const raw = fs.readFileSync(txtFile, "utf-8");
    const cleaned = trimPG(raw);
    const sents = splitSentences(cleaned);

    if(sents.length === 0){
      console.log(`  ⚠️ ${bookId}：没有有效句子`);
      return;
    }

    // 只取前 500 句（够用且文件不会太大）
    const selectedSents = sents.slice(0, 500);
    const output = [];

    selectedSents.forEach((text, i) => {
      const sid = `${bookId}_s${String(i+1).padStart(3,"0")}`;
      const chunks = AssemblyCore.splitIntoChunks(text);
      const roles = AssemblyCore.chunkRoles(chunks);

      // 计算 readability（简化 Flesch-Kincaid 类似公式）
      const words = countWords(text);
      const letters = (text.match(/[A-Za-z]/g) || []).length;
      const readability = words > 0 ? Math.round(letters/words*10)/10 : 5.0;

      // 目标词：从 chunks 中提取有意义的词
      const allWords = (text.match(/[A-Za-z']+/g) || []).map(w => w.toLowerCase());
      const stopwords = new Set(["the","a","an","is","are","was","were","be","been","being",
        "have","has","had","do","does","did","will","would","shall","should","can","could",
        "may","might","must","of","in","on","at","to","for","with","by","from","as",
        "and","but","or","that","which","who","whom","this","these","those","it","its",
        "i","me","my","mine","we","us","our","you","your","he","him","his","she","her",
        "they","them","their","what","when","where","why","how","not","no","so","if",
        "then","than","just","about","into","through","over","under","up","down","out"]);
      const targetWords = [...new Set(allWords.filter(w => !stopwords.has(w) && w.length > 3))]
        .slice(0, 3);

      const sentence = {
        sentence_id: sid,
        book_id: bookId,
        level: "B1",  // 第一版统一 B1，可后续细化
        text: text,
        zh: "",  // 第一版运行时机翻，或从 dict 拼接（太麻烦，留空）
        target_words: targetWords,
        chunks: chunks,
        chunk_roles: roles,
        readability: readability
      };

      output.push(sentence);
      index[sid] = `${bookId}.json`;
    });

    const outPath = path.join(sentencesDir, `${bookId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output));
    totalSents += output.length;
    totalBooks++;
    console.log(`  ✅ ${bookId}: ${output.length} 句 → ${bookId}.json`);
  });

  // 写 index.json
  fs.writeFileSync(path.join(sentencesDir, "index.json"), JSON.stringify(index));
  console.log(`\n🎉 构建完成：${totalBooks} 本书，${totalSents} 句 → sentences/index.json`);
}

if(require.main === module){
  main();
}
