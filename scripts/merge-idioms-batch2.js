/**
 * 词库扩充批次脚本 — 2026-07 批次
 * 选题口径:1) 必须有典故(meaning 写"典故 + 比喻义",供锦囊使用);2) 不冷僻,普通玩家可猜出。
 * 用法:node scripts/merge-idioms-batch2.js && npm run sync:data && npm test
 * 字段策略:已有字的 部首/笔画/结构/部首位置 复用主词库,保证口径一致;新字用 NEW_CHAR_DATA 标注。
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const dataPath = path.join(root, 'data/idioms.json')
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

// 新字标注:char: [部首, 笔画, 结构, 部首位置]
const NEW_CHAR_DATA = {
  自: ['自', 6, '独体', 'center'], 相: ['目', 9, '左右', 'right'], 矛: ['矛', 5, '独体', 'center'], 盾: ['目', 9, '半包围', 'center'],
  滥: ['氵', 13, '左右', 'left'], 竽: ['竹', 9, '上下', 'top'], 充: ['亠', 6, '上下', 'top'], 数: ['攵', 13, '左右', 'right'],
  愚: ['心', 13, '上下', 'bottom'], 移: ['禾', 11, '左右', 'left'],
  拔: ['扌', 8, '左右', 'left'], 苗: ['艹', 8, '上下', 'top'], 助: ['力', 7, '左右', 'right'],
  塞: ['土', 13, '上下', 'bottom'], 翁: ['羽', 10, '上下', 'bottom'], 失: ['丿', 5, '独体', 'center'],
  南: ['十', 9, '上下', 'top'], 辕: ['车', 14, '左右', 'left'], 北: ['匕', 5, '左右', 'right'], 辙: ['车', 16, '左右', 'left'],
  饼: ['饣', 9, '左右', 'left'], 饥: ['饣', 5, '左右', 'left'],
  熟: ['灬', 15, '上下', 'bottom'], 生: ['生', 5, '独体', 'center'], 巧: ['工', 5, '左右', 'left'],
  鼓: ['鼓', 13, '左右', 'center'], 作: ['亻', 7, '左右', 'left'], 反: ['又', 4, '半包围', 'center'],
  温: ['氵', 12, '左右', 'left'], 故: ['攵', 9, '左右', 'right'], 知: ['矢', 8, '左右', 'left'], 新: ['斤', 13, '左右', 'right'],
  精: ['米', 14, '左右', 'left'], 卫: ['卩', 3, '独体', 'center'], 填: ['土', 13, '左右', 'left'],
  买: ['乛', 6, '上下', 'top'], 椟: ['木', 12, '左右', 'left'], 还: ['辶', 7, '半包围', 'center'], 珠: ['王', 10, '左右', 'left'],
  朝: ['月', 12, '左右', 'right'], 暮: ['日', 14, '上下', 'bottom'],
  鹿: ['鹿', 11, '半包围', 'center'],
  完: ['宀', 7, '上下', 'top'], 璧: ['玉', 18, '上下', 'bottom'], 赵: ['走', 9, '半包围', 'center'],
  负: ['贝', 6, '上下', 'bottom'], 荆: ['艹', 9, '上下', 'top'], 请: ['讠', 10, '左右', 'left'], 罪: ['罒', 13, '上下', 'top'],
  毛: ['毛', 4, '独体', 'center'], 遂: ['辶', 12, '半包围', 'center'], 荐: ['艹', 9, '上下', 'top'],
  战: ['戈', 9, '左右', 'right'], 暗: ['日', 13, '左右', 'left'], 度: ['广', 9, '半包围', 'center'],
  陈: ['阝', 7, '左右', 'left'], 仓: ['人', 4, '上下', 'top'], 埋: ['土', 10, '左右', 'left'], 伏: ['亻', 6, '左右', 'left'],
  约: ['纟', 6, '左右', 'left'], 法: ['氵', 8, '左右', 'left'],
  运: ['辶', 7, '半包围', 'center'], 帷: ['巾', 11, '左右', 'left'], 幄: ['巾', 12, '左右', 'left'],
  多: ['夕', 6, '上下', 'top'], 益: ['皿', 10, '上下', 'bottom'], 善: ['口', 12, '上下', 'bottom'],
  诺: ['讠', 10, '左右', 'left'], 字: ['子', 6, '上下', 'bottom'],
  图: ['囗', 8, '全包围', 'center'], 穷: ['穴', 7, '上下', 'top'], 匕: ['匕', 2, '独体', 'center'], 见: ['见', 4, '独体', 'center'],
  唇: ['口', 10, '半包围', 'bottom'], 齿: ['齿', 8, '上下', 'center'],
  退: ['辶', 9, '半包围', 'center'], 避: ['辶', 16, '半包围', 'center'], 舍: ['人', 8, '上下', 'top'],
  病: ['疒', 10, '半包围', 'center'], 肓: ['月', 7, '上下', 'bottom'],
  老: ['耂', 6, '半包围', 'center'], 识: ['讠', 7, '左右', 'left'], 途: ['辶', 10, '半包围', 'center'],
  狡: ['犭', 9, '左右', 'left'], 窟: ['穴', 13, '上下', 'top'],
  枕: ['木', 8, '左右', 'left'], 庭: ['广', 9, '半包围', 'center'], 市: ['巾', 5, '上下', 'bottom'],
  可: ['口', 5, '半包围', 'center'], 罗: ['罒', 8, '上下', 'top'], 雀: ['隹', 11, '上下', 'bottom'],
  再: ['一', 6, '独体', 'center'], 草: ['艹', 9, '上下', 'top'], 皆: ['白', 9, '上下', 'bottom'], 唳: ['口', 11, '左右', 'left'],
  势: ['力', 8, '上下', 'bottom'], 迎: ['辶', 7, '半包围', 'center'], 刃: ['刀', 3, '独体', 'center'], 解: ['角', 13, '左右', 'left'],
  洛: ['氵', 9, '左右', 'left'], 阳: ['阝', 6, '左右', 'left'], 贵: ['贝', 9, '上下', 'bottom'],
  江: ['氵', 6, '左右', 'left'], 郎: ['阝', 8, '左右', 'right'], 才: ['一', 3, '独体', 'center'], 尽: ['尸', 6, '半包围', 'center'],
  斗: ['斗', 4, '独体', 'center'], 诗: ['讠', 8, '左右', 'left'],
  乐: ['丿', 5, '独体', 'center'], 思: ['心', 9, '上下', 'bottom'],
  刮: ['刂', 8, '左右', 'right'], 看: ['目', 9, '上下', 'bottom'],
  手: ['手', 4, '独体', 'center'], 释: ['釆', 12, '左右', 'left'], 卷: ['卩', 8, '上下', 'bottom'],
  初: ['刀', 7, '左右', 'right'], 出: ['凵', 5, '独体', 'center'],
  骨: ['骨', 9, '上下', 'center'], 疗: ['疒', 7, '半包围', 'center'], 毒: ['母', 9, '上下', 'bottom'],
  世: ['一', 5, '独体', 'center'], 外: ['夕', 5, '左右', 'left'], 桃: ['木', 10, '左右', 'left'], 源: ['氵', 13, '左右', 'left'],
  黔: ['黑', 16, '左右', 'left'], 驴: ['马', 7, '左右', 'left'], 技: ['扌', 7, '左右', 'left'],
  游: ['氵', 12, '左右', 'left'], 余: ['人', 7, '上下', 'top'], 应: ['广', 7, '半包围', 'center'],
  洋: ['氵', 9, '左右', 'left'], 兴: ['八', 6, '上下', 'bottom'],
  濡: ['氵', 17, '左右', 'left'], 以: ['人', 4, '左右', 'right'], 沫: ['氵', 8, '左右', 'left'],
  音: ['音', 9, '上下', 'center'], 绕: ['纟', 9, '左右', 'left'],
  曲: ['曰', 6, '独体', 'center'], 寡: ['宀', 14, '上下', 'top'],
  讳: ['讠', 6, '左右', 'left'], 疾: ['疒', 10, '半包围', 'center'], 忌: ['心', 7, '上下', 'bottom'], 医: ['匚', 7, '半包围', 'center'],
  死: ['歹', 6, '左右', 'left'], 回: ['囗', 6, '全包围', 'center'], 症: ['疒', 10, '半包围', 'center'], 下: ['一', 3, '独体', 'center'],
  药: ['艹', 9, '上下', 'top'], 名: ['口', 6, '上下', 'bottom'], 落: ['艹', 12, '上下', 'top'],
  镜: ['钅', 16, '左右', 'left'], 重: ['丿', 9, '独体', 'center'],
  覆: ['覀', 18, '上下', 'top'], 难: ['隹', 10, '左右', 'right'], 收: ['攵', 6, '左右', 'right'],
  屋: ['尸', 9, '半包围', 'center'], 藏: ['艹', 17, '上下', 'top'], 娇: ['女', 9, '左右', 'left'],
  君: ['口', 7, '上下', 'bottom'], 瓮: ['瓦', 8, '上下', 'bottom'], 窗: ['穴', 12, '上下', 'top'], 事: ['一', 8, '独体', 'center'],
  忠: ['心', 8, '上下', 'bottom'], 国: ['囗', 8, '全包围', 'center'],
  从: ['人', 4, '左右', 'left'], 戎: ['戈', 6, '独体', 'center'],
  革: ['革', 9, '独体', 'center'], 裹: ['衣', 14, '镶嵌', 'center'], 尸: ['尸', 3, '独体', 'center'],
  壮: ['士', 6, '左右', 'right'],
  揭: ['扌', 12, '左右', 'left'], 竿: ['竹', 9, '上下', 'top'],
  锦: ['钅', 13, '左右', 'left'], 乡: ['幺', 3, '独体', 'center'],
  夜: ['夕', 8, '上下', 'bottom'], 大: ['大', 3, '独体', 'center'],
  空: ['穴', 8, '上下', 'top'], 惯: ['忄', 11, '左右', 'left'],
  抛: ['扌', 7, '左右', 'left'], 砖: ['石', 9, '左右', 'left'], 引: ['弓', 4, '左右', 'left'],
  孟: ['子', 8, '上下', 'top'], 母: ['母', 5, '独体', 'center'], 迁: ['辶', 6, '半包围', 'center'],
  器: ['口', 16, '上下', 'top'], 晚: ['日', 11, '左右', 'left'],
  呕: ['口', 7, '左右', 'left'], 沥: ['氵', 7, '左右', 'left'], 血: ['血', 6, '独体', 'center'],
  忘: ['心', 7, '上下', 'bottom'], 乘: ['丿', 10, '独体', 'center'], 浪: ['氵', 10, '左右', 'left'],
  滴: ['氵', 14, '左右', 'left'], 石: ['石', 5, '独体', 'center'], 穿: ['穴', 9, '上下', 'top'],
  铁: ['钅', 10, '左右', 'left'], 杵: ['木', 8, '左右', 'left'], 针: ['钅', 7, '左右', 'left'],
  围: ['囗', 7, '全包围', 'center'], 魏: ['鬼', 17, '左右', 'right'], 救: ['攵', 11, '左右', 'right'],
  击: ['凵', 5, '独体', 'center'], 西: ['西', 6, '独体', 'center'],
  螂: ['虫', 14, '左右', 'left'], 捕: ['扌', 10, '左右', 'left'],
  雁: ['厂', 12, '半包围', 'center'], 倾: ['亻', 10, '左右', 'left'], 城: ['土', 9, '左右', 'left'], 妙: ['女', 7, '左右', 'left'],
}

// 批次条目:全部"有典故 + 不冷僻",meaning = 典故梗概 + 比喻义,供锦囊直接使用
const NEW_IDIOMS = [
  // ===== Level 1:课本级寓言/名句,人人能讲 =====
  { text: '自相矛盾', pinyin: ['zì', 'xiāng', 'máo', 'dùn'], level: 1, source: '《韩非子·难一》', tags: ['寓言', '哲理'], meaning: '楚人同时夸耀无坚不摧的矛和刺不破的盾，被问"用你的矛刺你的盾"当场语塞；比喻言行前后抵触' },
  { text: '滥竽充数', pinyin: ['làn', 'yú', 'chōng', 'shù'], level: 1, source: '《韩非子·内储说上》', tags: ['寓言', '讽刺'], meaning: '不会吹竽的南郭先生混在齐宣王三百人乐队里凑数，新王要听独奏时只好逃走；比喻没有真才实学的人混在行家里充数' },
  { text: '愚公移山', pinyin: ['yú', 'gōng', 'yí', 'shān'], level: 1, source: '《列子·汤问》', tags: ['寓言', '励志'], meaning: '九十岁的愚公率子孙挖山不止，感动天帝派神移走两座大山；比喻做事有顽强毅力，不怕困难' },
  { text: '拔苗助长', pinyin: ['bá', 'miáo', 'zhù', 'zhǎng'], level: 1, source: '《孟子·公孙丑上》', tags: ['寓言', '哲理'], meaning: '宋人嫌禾苗长得慢，把苗一棵棵拔高，结果苗全枯死；比喻违反事物规律、急于求成反而坏事' },
  { text: '塞翁失马', pinyin: ['sài', 'wēng', 'shī', 'mǎ'], level: 1, source: '《淮南子·人间训》', tags: ['寓言', '哲理'], meaning: '边塞老翁丢了马反而引来骏马，儿子骑马摔伤却因此免于战祸；比喻祸福相依，坏事在一定条件下可变为好事' },
  { text: '南辕北辙', pinyin: ['nán', 'yuán', 'běi', 'zhé'], level: 1, source: '《战国策·魏策四》', tags: ['寓言', '哲理'], meaning: '有人要去南方的楚国，却驾车一路向北，还夸自己马好、路费多；比喻行动和目的正好相反' },
  { text: '惊弓之鸟', pinyin: ['jīng', 'gōng', 'zhī', 'niǎo'], level: 1, source: '《战国策·楚策四》', tags: ['寓言', '心理'], meaning: '神射手更羸不放箭只拉弓弦，受过箭伤的大雁闻声坠落；比喻受过惊吓的人遇到一点动静就异常恐慌' },
  { text: '画饼充饥', pinyin: ['huà', 'bǐng', 'chōng', 'jī'], level: 1, source: '《三国志·魏志·卢毓传》', tags: ['历史', '哲理'], meaning: '魏明帝说选官不能只凭名声，名声如画在地上的饼不能吃；比喻用空想安慰自己，不解决实际问题' },
  { text: '熟能生巧', pinyin: ['shú', 'néng', 'shēng', 'qiǎo'], level: 1, source: '欧阳修《归田录》', tags: ['励志', '学问'], meaning: '卖油翁把油从铜钱方孔注入而钱不沾油，自言"惟手熟尔"；指做事熟练了自然掌握窍门' },
  { text: '一鼓作气', pinyin: ['yī', 'gǔ', 'zuò', 'qì'], level: 1, source: '《左传·庄公十年》', tags: ['历史', '励志'], meaning: '曹刿论战说第一次击鼓士气最盛，再而衰，三而竭；比喻趁劲头正足时一口气把事情做完' },
  { text: '举一反三', pinyin: ['jǔ', 'yī', 'fǎn', 'sān'], level: 1, source: '《论语·述而》', tags: ['学问', '智慧'], meaning: '孔子说"举一隅不以三隅反，则不复也"；指从一件事情类推而知道许多事情，善于触类旁通' },
  { text: '温故知新', pinyin: ['wēn', 'gù', 'zhī', 'xīn'], level: 1, source: '《论语·为政》', tags: ['学问', '智慧'], meaning: '孔子说"温故而知新，可以为师矣"；指复习旧知识能获得新的理解和体会' },

  // ===== Level 2:常见典故成语 =====
  { text: '精卫填海', pinyin: ['jīng', 'wèi', 'tián', 'hǎi'], level: 2, source: '《山海经·北山经》', tags: ['神话', '励志'], meaning: '炎帝之女溺亡于东海，化为精卫鸟日日衔木石要填平大海；比喻意志坚决，不畏艰难' },
  { text: '买椟还珠', pinyin: ['mǎi', 'dú', 'huán', 'zhū'], level: 2, source: '《韩非子·外储说左上》', tags: ['寓言', '讽刺'], meaning: '郑人买下装珍珠的精美木匣，却把珍珠退还给卖家；比喻没有眼光，取舍不当，只重外表不重实质' },
  { text: '朝三暮四', pinyin: ['zhāo', 'sān', 'mù', 'sì'], level: 2, source: '《庄子·齐物论》', tags: ['寓言', '讽刺'], meaning: '养猴人喂橡子，说早上三颗晚上四颗猴子大怒，改说早四晚三猴子转喜；原指玩弄手法欺骗人，后指反复无常' },
  { text: '指鹿为马', pinyin: ['zhǐ', 'lù', 'wéi', 'mǎ'], level: 2, source: '《史记·秦始皇本纪》', tags: ['历史', '讽刺'], meaning: '赵高在朝堂上献鹿说是马，借群臣的回答铲除异己；比喻公然歪曲事实，颠倒黑白' },
  { text: '完璧归赵', pinyin: ['wán', 'bì', 'guī', 'zhào'], level: 2, source: '《史记·廉颇蔺相如列传》', tags: ['历史', '智慧'], meaning: '蔺相如奉和氏璧入秦，识破秦王无意偿城，设计将璧完好送回赵国；比喻把原物完整无损地归还本人' },
  { text: '负荆请罪', pinyin: ['fù', 'jīng', 'qǐng', 'zuì'], level: 2, source: '《史记·廉颇蔺相如列传》', tags: ['历史', '品格'], meaning: '廉颇背着荆条到蔺相如门前认错，将相和好共保赵国；表示主动向对方承认错误、请求责罚' },
  { text: '毛遂自荐', pinyin: ['máo', 'suì', 'zì', 'jiàn'], level: 2, source: '《史记·平原君虞卿列传》', tags: ['历史', '励志'], meaning: '门客毛遂主动请求随平原君出使楚国，促成合纵抗秦；比喻自告奋勇，自己推荐自己担任工作' },
  { text: '背水一战', pinyin: ['bèi', 'shuǐ', 'yī', 'zhàn'], level: 2, source: '《史记·淮阴侯列传》', tags: ['历史', '战争'], meaning: '韩信背靠河水布阵，士兵无路可退拼死作战，大破赵军；比喻在绝境中为求出路而决一死战' },
  { text: '暗度陈仓', pinyin: ['àn', 'dù', 'chén', 'cāng'], level: 2, source: '《史记·高祖本纪》', tags: ['历史', '谋略'], meaning: '韩信明修栈道迷惑对手，暗中率军从陈仓小道出击平定三秦；比喻用假象迷惑对方、暗中采取行动' },
  { text: '十面埋伏', pinyin: ['shí', 'miàn', 'mái', 'fú'], level: 2, source: '《史记·项羽本纪》', tags: ['历史', '战争'], meaning: '垓下之战汉军层层设伏，将项羽困于核心；比喻四面布置圈套，使人处处受敌、无路可走' },
  { text: '约法三章', pinyin: ['yuē', 'fǎ', 'sān', 'zhāng'], level: 2, source: '《史记·高祖本纪》', tags: ['历史', '规则'], meaning: '刘邦入关中，与百姓约定"杀人者死，伤人及盗抵罪"三条法令；泛指事先订好简单的规矩共同遵守' },
  { text: '运筹帷幄', pinyin: ['yùn', 'chóu', 'wéi', 'wò'], level: 2, source: '《史记·高祖本纪》', tags: ['历史', '谋略'], meaning: '刘邦称赞张良"运筹策帷帐之中，决胜千里之外"；指在后方帐幕内谋划军国大计' },
  { text: '多多益善', pinyin: ['duō', 'duō', 'yì', 'shàn'], level: 2, source: '《史记·淮阴侯列传》', tags: ['历史', '智慧'], meaning: '刘邦问韩信能带多少兵，韩信答"臣多多而益善耳"；指越多越好，不厌其多' },
  { text: '一诺千金', pinyin: ['yī', 'nuò', 'qiān', 'jīn'], level: 2, source: '《史记·季布栾布列传》', tags: ['历史', '品格'], meaning: '楚人说"得黄金百斤，不如得季布一诺"；比喻说话极有信用，一句许诺价值千金' },
  { text: '一字千金', pinyin: ['yī', 'zì', 'qiān', 'jīn'], level: 2, source: '《史记·吕不韦列传》', tags: ['历史', '文学'], meaning: '吕不韦把《吕氏春秋》挂在城门，悬赏能改一字者赏千金；称赞文辞精妙，一字不可更改' },
  { text: '图穷匕见', pinyin: ['tú', 'qióng', 'bǐ', 'xiàn'], level: 2, source: '《战国策·燕策三》', tags: ['历史', '谋略'], meaning: '荆轲献燕国地图，图卷展到尽头露出匕首刺秦王；比喻事情发展到最后，真相或本意完全暴露' },
  { text: '唇亡齿寒', pinyin: ['chún', 'wáng', 'chǐ', 'hán'], level: 2, source: '《左传·僖公五年》', tags: ['历史', '哲理'], meaning: '宫之奇劝虞公"嘴唇没了牙齿就受冻"，虞借道于晋终致亡国；比喻利害相关，一方受损另一方难保' },
  { text: '退避三舍', pinyin: ['tuì', 'bì', 'sān', 'shè'], level: 2, source: '《左传·僖公二十三年》', tags: ['历史', '品格'], meaning: '晋文公重耳为报楚成王收留之恩，交战时主动退军九十里；比喻主动退让回避，不与人相争' },
  { text: '病入膏肓', pinyin: ['bìng', 'rù', 'gāo', 'huāng'], level: 2, source: '《左传·成公十年》', tags: ['历史', '医道'], meaning: '晋景公梦见病变成两个小孩，躲进药力达不到的膏肓之间；形容病势严重无法医治，也比喻事态无可挽回' },
  { text: '老马识途', pinyin: ['lǎo', 'mǎ', 'shí', 'tú'], level: 2, source: '《韩非子·说林上》', tags: ['历史', '智慧'], meaning: '管仲随齐桓公伐孤竹迷路，放老马前行而寻得归途；比喻有经验的人熟悉情况，能引导他人' },
  { text: '狡兔三窟', pinyin: ['jiǎo', 'tù', 'sān', 'kū'], level: 2, source: '《战国策·齐策四》', tags: ['历史', '谋略'], meaning: '冯谖对孟尝君说狡兔有三个洞才能免于一死，并为他营造三处退路；比喻藏身的地方多、留好后路' },
  { text: '高枕无忧', pinyin: ['gāo', 'zhěn', 'wú', 'yōu'], level: 2, source: '《战国策·齐策四》', tags: ['历史', '生活'], meaning: '冯谖为孟尝君凿好"三窟"后说"君姑高枕为乐矣"；比喻平安无事，不必担忧' },
  { text: '门庭若市', pinyin: ['mén', 'tíng', 'ruò', 'shì'], level: 2, source: '《战国策·齐策一》', tags: ['历史', '景象'], meaning: '邹忌讽齐王纳谏，齐王悬赏求谏后"群臣进谏，门庭若市"；形容登门的人极多，像集市一样热闹' },
  { text: '门可罗雀', pinyin: ['mén', 'kě', 'luó', 'què'], level: 2, source: '《史记·汲郑列传》', tags: ['历史', '景象'], meaning: '翟公罢官后宾客散尽，门前冷落得可以张网捕雀；形容门庭冷落，来访者稀少' },
  { text: '东山再起', pinyin: ['dōng', 'shān', 'zài', 'qǐ'], level: 2, source: '《晋书·谢安传》', tags: ['历史', '励志'], meaning: '谢安隐居东山多年后复出为相，指挥淝水之战大胜；比喻失势之后重新恢复地位' },
  { text: '草木皆兵', pinyin: ['cǎo', 'mù', 'jiē', 'bīng'], level: 2, source: '《晋书·苻坚载记》', tags: ['历史', '心理'], meaning: '淝水之战苻坚登城望八公山，把草木都看成晋军；形容惊慌时疑神疑鬼、风吹草动都当敌情' },
  { text: '风声鹤唳', pinyin: ['fēng', 'shēng', 'hè', 'lì'], level: 2, source: '《晋书·谢玄传》', tags: ['历史', '心理'], meaning: '淝水败退的秦兵听到风声鹤叫都以为是追兵；形容惊慌失措，自相惊扰' },
  { text: '势如破竹', pinyin: ['shì', 'rú', 'pò', 'zhú'], level: 2, source: '《晋书·杜预传》', tags: ['历史', '战争'], meaning: '杜预伐吴时说"譬如破竹，数节之后，皆迎刃而解"；比喻节节胜利，毫无阻碍' },
  { text: '迎刃而解', pinyin: ['yíng', 'rèn', 'ér', 'jiě'], level: 2, source: '《晋书·杜预传》', tags: ['历史', '智慧'], meaning: '杜预说竹子劈开数节后，下面都会顺着刀刃裂开；比喻主要问题解决后，其余问题随之轻松解决' },
  { text: '洛阳纸贵', pinyin: ['luò', 'yáng', 'zhǐ', 'guì'], level: 2, source: '《晋书·左思传》', tags: ['历史', '文学'], meaning: '左思《三都赋》写成后豪贵之家竞相传抄，洛阳纸价为之上涨；比喻著作广为流传，风行一时' },
  { text: '江郎才尽', pinyin: ['jiāng', 'láng', 'cái', 'jìn'], level: 2, source: '《南史·江淹传》', tags: ['历史', '文学'], meaning: '江淹晚年梦见郭璞索还五色笔，从此再无佳句；比喻才思减退，写不出好作品' },
  { text: '才高八斗', pinyin: ['cái', 'gāo', 'bā', 'dǒu'], level: 2, source: '《释常谈》', tags: ['历史', '文学'], meaning: '谢灵运说天下才共一石，曹子建独占八斗；形容人文才极高' },
  { text: '七步成诗', pinyin: ['qī', 'bù', 'chéng', 'shī'], level: 2, source: '《世说新语·文学》', tags: ['历史', '文学'], meaning: '曹丕命曹植七步内作诗，曹植吟出"煮豆燃萁"之句；形容才思敏捷，出口成章' },
  { text: '乐不思蜀', pinyin: ['lè', 'bù', 'sī', 'shǔ'], level: 2, source: '《三国志》裴松之注', tags: ['历史', '讽刺'], meaning: '蜀后主刘禅降魏后被问想不想蜀地，答"此间乐，不思蜀"；比喻乐而忘返或乐而忘本' },
  { text: '刮目相看', pinyin: ['guā', 'mù', 'xiāng', 'kàn'], level: 2, source: '《三国志·吴志·吕蒙传》', tags: ['历史', '励志'], meaning: '吕蒙听劝读书大有长进，鲁肃赞叹，吕蒙说"士别三日，即更刮目相待"；指用新眼光看待进步了的人' },
  { text: '手不释卷', pinyin: ['shǒu', 'bù', 'shì', 'juàn'], level: 2, source: '《三国志》注引《江表传》', tags: ['历史', '学问'], meaning: '孙权劝吕蒙学习，举光武帝行军仍手不离书为例；形容勤奋好学，书本不离手' },
  { text: '初出茅庐', pinyin: ['chū', 'chū', 'máo', 'lú'], level: 2, source: '《三国演义》', tags: ['历史', '成长'], meaning: '诸葛亮离开隆中草庐辅佐刘备，首战火烧博望坡告捷；原指初次显露才华，现多指刚进入社会缺乏经验' },
  { text: '刮骨疗毒', pinyin: ['guā', 'gǔ', 'liáo', 'dú'], level: 2, source: '《三国志·蜀志·关羽传》', tags: ['历史', '品格'], meaning: '关羽中毒箭，华佗刮骨去毒，关羽饮酒下棋谈笑自若；比喻意志坚强，也比喻从根本上解决问题' },
  { text: '世外桃源', pinyin: ['shì', 'wài', 'táo', 'yuán'], level: 2, source: '陶渊明《桃花源记》', tags: ['文学', '理想'], meaning: '武陵渔人误入与世隔绝的桃花源，见人人安居乐业；比喻不受外界影响的理想安乐之地' },
  { text: '黔驴技穷', pinyin: ['qián', 'lǘ', 'jì', 'qióng'], level: 2, source: '柳宗元《三戒·黔之驴》', tags: ['寓言', '讽刺'], meaning: '运到黔地的驴只会一声吼、一踢腿，被老虎看穿后吃掉；比喻有限的一点本领用完，再无办法' },
  { text: '呆若木鸡', pinyin: ['dāi', 'ruò', 'mù', 'jī'], level: 2, source: '《庄子·达生》', tags: ['寓言', '心理'], meaning: '纪渻子养斗鸡，练到心神安定如木鸡，别的鸡见了就跑；原是境界极高之褒义，今形容因惊惧而发愣' },
  { text: '游刃有余', pinyin: ['yóu', 'rèn', 'yǒu', 'yú'], level: 2, source: '《庄子·养生主》', tags: ['寓言', '智慧'], meaning: '庖丁解牛顺着骨节空隙下刀，十九年刀刃如新；比喻技艺熟练，解决问题轻松利落' },
  { text: '得心应手', pinyin: ['dé', 'xīn', 'yìng', 'shǒu'], level: 2, source: '《庄子·天道》', tags: ['寓言', '智慧'], meaning: '轮扁斫轮"得之于手而应于心"，火候只可意会；形容技艺纯熟，心里怎么想手就能怎么做' },
  { text: '望洋兴叹', pinyin: ['wàng', 'yáng', 'xīng', 'tàn'], level: 2, source: '《庄子·秋水》', tags: ['寓言', '哲理'], meaning: '河伯秋汛时自满，到北海见汪洋无际才仰视感叹；比喻做事因力量不够或条件不足而无可奈何' },
  { text: '相濡以沫', pinyin: ['xiāng', 'rú', 'yǐ', 'mò'], level: 2, source: '《庄子·大宗师》', tags: ['寓言', '情感'], meaning: '泉水干涸，鱼靠唾沫互相湿润求生；比喻同处困境时用微薄之力互相救助' },
  { text: '高山流水', pinyin: ['gāo', 'shān', 'liú', 'shuǐ'], level: 2, source: '《列子·汤问》', tags: ['历史', '情感'], meaning: '伯牙鼓琴志在高山流水，钟子期都能听懂，子期死后伯牙终身不复鼓琴；比喻知音难遇或乐曲高妙' },
  { text: '余音绕梁', pinyin: ['yú', 'yīn', 'rào', 'liáng'], level: 2, source: '《列子·汤问》', tags: ['历史', '艺术'], meaning: '歌者韩娥离去后，歌声余音绕着屋梁三日不绝；形容歌声或音乐优美，令人回味' },
  { text: '曲高和寡', pinyin: ['qǔ', 'gāo', 'hè', 'guǎ'], level: 2, source: '宋玉《对楚王问》', tags: ['历史', '艺术'], meaning: '宋玉说唱《阳春白雪》时全城能跟着唱的不过数十人；比喻言论或作品格调越高，能理解的人越少' },
  { text: '讳疾忌医', pinyin: ['huì', 'jí', 'jì', 'yī'], level: 2, source: '《韩非子·喻老》', tags: ['寓言', '哲理'], meaning: '蔡桓公讳言有病拒绝扁鹊诊治，病入骨髓而亡；比喻掩饰缺点错误，不愿改正' },
  { text: '起死回生', pinyin: ['qǐ', 'sǐ', 'huí', 'shēng'], level: 2, source: '《史记·扁鹊仓公列传》', tags: ['历史', '医道'], meaning: '扁鹊救活"已死"半日的虢国太子，却说"我不能生死人，是他本不当死"；形容医术或手段高明，能挽回绝境' },
  { text: '对症下药', pinyin: ['duì', 'zhèng', 'xià', 'yào'], level: 2, source: '《三国志·魏志·华佗传》', tags: ['历史', '医道'], meaning: '华佗给症状相同的两人开不同的药，因病因一表一里；比喻针对具体情况采取有效办法' },
  { text: '名落孙山', pinyin: ['míng', 'luò', 'sūn', 'shān'], level: 2, source: '范公偁《过庭录》', tags: ['历史', '科举'], meaning: '孙山考中末名回乡，答乡人"解名尽处是孙山，贤郎更在孙山外"；委婉指考试或选拔未被录取' },
  { text: '破镜重圆', pinyin: ['pò', 'jìng', 'chóng', 'yuán'], level: 2, source: '孟棨《本事诗》', tags: ['历史', '情感'], meaning: '徐德言与乐昌公主离乱前各执半面铜镜为信，后凭镜相认团聚；比喻夫妻失散或决裂后重新团圆' },
  { text: '覆水难收', pinyin: ['fù', 'shuǐ', 'nán', 'shōu'], level: 2, source: '《拾遗记》', tags: ['历史', '哲理'], meaning: '姜太公把泼在地上的水让求复合的前妻收回，水不可收；比喻事成定局，无法挽回' },
  { text: '金屋藏娇', pinyin: ['jīn', 'wū', 'cáng', 'jiāo'], level: 2, source: '《汉武故事》', tags: ['历史', '情感'], meaning: '汉武帝幼时说若得阿娇为妇，当以金屋贮之；原指对所爱之人的珍视，后指纳宠' },
  { text: '请君入瓮', pinyin: ['qǐng', 'jūn', 'rù', 'wèng'], level: 2, source: '《资治通鉴·唐纪》', tags: ['历史', '谋略'], meaning: '来俊臣问周兴如何逼供，周兴献计"以大瓮炭火烤之"，来俊臣即以此法审他；比喻用某人整人的办法整治他自己' },
  { text: '东窗事发', pinyin: ['dōng', 'chuāng', 'shì', 'fā'], level: 2, source: '《西湖游览志余》', tags: ['历史', '讽刺'], meaning: '传说秦桧在东窗下密谋害岳飞，死后阴谋败露；指罪行、阴谋暴露' },
  { text: '精忠报国', pinyin: ['jīng', 'zhōng', 'bào', 'guó'], level: 2, source: '《宋史·岳飞传》', tags: ['历史', '品格'], meaning: '岳母在岳飞背上刺字，岳飞以此为毕生信念抗金卫国；形容极其忠诚，为国家竭尽全力' },
  { text: '投笔从戎', pinyin: ['tóu', 'bǐ', 'cóng', 'róng'], level: 2, source: '《后汉书·班超传》', tags: ['历史', '励志'], meaning: '班超掷笔感叹大丈夫应效傅介子、张骞立功异域，遂投军出使西域；指文人弃文就武' },
  { text: '马革裹尸', pinyin: ['mǎ', 'gé', 'guǒ', 'shī'], level: 2, source: '《后汉书·马援传》', tags: ['历史', '品格'], meaning: '马援说男儿当战死边野，以马皮裹尸还葬；形容英勇作战、献身疆场的决心' },
  { text: '老当益壮', pinyin: ['lǎo', 'dāng', 'yì', 'zhuàng'], level: 2, source: '《后汉书·马援传》', tags: ['历史', '励志'], meaning: '马援六十二岁仍披甲上马请战，自言"老当益壮"；指年纪虽老而志气更旺盛' },
  { text: '揭竿而起', pinyin: ['jiē', 'gān', 'ér', 'qǐ'], level: 2, source: '贾谊《过秦论》', tags: ['历史', '战争'], meaning: '陈胜吴广"斩木为兵，揭竿为旗"发动大泽乡起义；指人民起义反抗' },
  { text: '衣锦还乡', pinyin: ['yī', 'jǐn', 'huán', 'xiāng'], level: 2, source: '《史记·项羽本纪》', tags: ['历史', '生活'], meaning: '项羽说"富贵不归故乡，如衣绣夜行"，执意东归；指功成名就后荣耀地回到家乡' },
  { text: '夜郎自大', pinyin: ['yè', 'láng', 'zì', 'dà'], level: 2, source: '《史记·西南夷列传》', tags: ['历史', '讽刺'], meaning: '小国夜郎问汉使"汉孰与我大"；比喻见识短浅却妄自尊大' },
  { text: '司空见惯', pinyin: ['sī', 'kōng', 'jiàn', 'guàn'], level: 2, source: '孟棨《本事诗》', tags: ['历史', '生活'], meaning: '刘禹锡赴司空李绅家宴写下"司空见惯浑闲事"；指某事常见，不足为奇' },
  { text: '抛砖引玉', pinyin: ['pāo', 'zhuān', 'yǐn', 'yù'], level: 2, source: '《景德传灯录》', tags: ['历史', '谦辞'], meaning: '相传常建先题两句诗于灵岩寺，引赵嘏续成佳句；比喻用粗浅的意见引出别人的高见' },
  { text: '孟母三迁', pinyin: ['mèng', 'mǔ', 'sān', 'qiān'], level: 2, source: '刘向《列女传》', tags: ['历史', '教育'], meaning: '孟子的母亲为选择好的教育环境，三次搬家最终定居学宫旁；形容家长为子女教育用心良苦' },
  { text: '程门立雪', pinyin: ['chéng', 'mén', 'lì', 'xuě'], level: 2, source: '《宋史·杨时传》', tags: ['历史', '学问'], meaning: '杨时拜见程颐，逢先生瞑坐便侍立不去，醒来时门外雪深一尺；形容尊敬师长、诚恳求学' },
  { text: '大器晚成', pinyin: ['dà', 'qì', 'wǎn', 'chéng'], level: 2, source: '《老子》', tags: ['哲理', '励志'], meaning: '老子说"大方无隅，大器晚成"，崔琰以此断言堂弟崔林必成大器；指能担当大事的人成就往往较晚' },
  { text: '呕心沥血', pinyin: ['ǒu', 'xīn', 'lì', 'xuè'], level: 2, source: '李商隐《李长吉小传》', tags: ['历史', '文学'], meaning: '诗人李贺骑驴觅句、每得佳句投锦囊，母亲叹"是儿要当呕出心乃已尔"；形容费尽心思心血' },
  { text: '一目十行', pinyin: ['yī', 'mù', 'shí', 'háng'], level: 2, source: '《梁书·简文帝纪》', tags: ['历史', '学问'], meaning: '梁简文帝萧纲"读书十行俱下"；形容阅读速度极快' },
  { text: '过目不忘', pinyin: ['guò', 'mù', 'bù', 'wàng'], level: 2, source: '《晋书·苻融载记》', tags: ['历史', '学问'], meaning: '苻融"耳闻则诵，过目不忘"，断案如神；形容记忆力极强，看过就不会忘记' },
  { text: '乘风破浪', pinyin: ['chéng', 'fēng', 'pò', 'làng'], level: 2, source: '《宋书·宗悫传》', tags: ['历史', '励志'], meaning: '少年宗悫言志"愿乘长风破万里浪"；比喻志向远大，不怕困难奋勇前进' },
  { text: '水滴石穿', pinyin: ['shuǐ', 'dī', 'shí', 'chuān'], level: 2, source: '《鹤林玉露》', tags: ['历史', '励志'], meaning: '县令张乖崖惩戒小吏"一日一钱，千日千钱，绳锯木断，水滴石穿"；比喻坚持不懈，积小力成大功' },
  { text: '铁杵成针', pinyin: ['tiě', 'chǔ', 'chéng', 'zhēn'], level: 2, source: '《方舆胜览》', tags: ['历史', '励志'], meaning: '李白少时逃学，见老妇磨铁杵欲作针而受触动，发奋读书；比喻只要有恒心，再难的事也能成功' },
  { text: '围魏救赵', pinyin: ['wéi', 'wèi', 'jiù', 'zhào'], level: 2, source: '《史记·孙子吴起列传》', tags: ['历史', '谋略'], meaning: '孙膑不直接救赵，而引兵直攻魏都大梁，迫使魏军回撤解邯郸之围；指袭击敌方后方迫其撤兵的战术' },
  { text: '声东击西', pinyin: ['shēng', 'dōng', 'jī', 'xī'], level: 2, source: '《淮南子·兵略训》', tags: ['历史', '谋略'], meaning: '兵法"将欲西而示之以东"，制造假象调动敌人；指表面攻打东边，实际攻打西边的迷惑战术' },
  { text: '螳螂捕蝉', pinyin: ['táng', 'láng', 'bǔ', 'chán'], level: 2, source: '《说苑·正谏》', tags: ['寓言', '哲理'], meaning: '少孺子以"螳螂捕蝉，不知黄雀在后"劝谏吴王罢兵；比喻只顾眼前利益而不顾身后祸患' },
  { text: '沉鱼落雁', pinyin: ['chén', 'yú', 'luò', 'yàn'], level: 2, source: '《庄子·齐物论》', tags: ['文学', '容貌'], meaning: '庄子说毛嫱丽姬虽美，鱼见之深入、鸟见之高飞，后世反用为赞语；形容女子容貌极美' },
  { text: '倾国倾城', pinyin: ['qīng', 'guó', 'qīng', 'chéng'], level: 2, source: '《汉书·外戚传》', tags: ['历史', '容貌'], meaning: '李延年歌"一顾倾人城，再顾倾人国"，汉武帝因此召见其妹李夫人；形容女子容貌绝美' },
  { text: '妙笔生花', pinyin: ['miào', 'bǐ', 'shēng', 'huā'], level: 2, source: '《开元天宝遗事》', tags: ['历史', '文学'], meaning: '李白少时梦见笔头生花，从此才思横溢名闻天下；比喻杰出的写作才能' },
]

// ===== 合并 =====
const existingTexts = new Set(data.idioms.map(item => item.text))
const charData = {}
data.idioms.forEach(item => {
  item.chars.forEach((char, index) => {
    if (!charData[char]) {
      charData[char] = [item.radicals[index], item.strokes[index], item.structures[index], item.radicalPositions[index]]
    }
  })
})
Object.keys(NEW_CHAR_DATA).forEach(char => {
  if (!charData[char]) charData[char] = NEW_CHAR_DATA[char]
})

let nextId = data.idioms.reduce((max, item) => Math.max(max, item.id || 0), 0)
const errors = []
const added = []
let skipped = 0

NEW_IDIOMS.forEach(entry => {
  if (existingTexts.has(entry.text)) {
    skipped += 1
    return
  }
  const chars = Array.from(entry.text)
  if (chars.length !== 4) { errors.push(entry.text + ' 不是 4 字'); return }
  if (entry.pinyin.length !== 4) { errors.push(entry.text + ' 拼音不足 4 个'); return }
  const radicals = [], strokes = [], structures = [], radicalPositions = []
  for (const char of chars) {
    const info = charData[char]
    if (!info) { errors.push(entry.text + ' 缺少字形数据: ' + char); return }
    radicals.push(info[0]); strokes.push(info[1]); structures.push(info[2]); radicalPositions.push(info[3])
  }
  nextId += 1
  added.push({
    id: nextId,
    text: entry.text,
    chars,
    pinyin: entry.pinyin,
    radicals,
    strokes,
    structures,
    meaning: entry.meaning,
    source: entry.source,
    level: entry.level,
    tags: entry.tags,
    radicalPositions,
  })
  existingTexts.add(entry.text)
})

if (errors.length > 0) {
  console.error('合并失败:')
  errors.forEach(msg => console.error(' -', msg))
  process.exit(1)
}

data.idioms = data.idioms.concat(added)
data.total = data.idioms.length
Object.keys(data.levels).forEach(level => {
  data.levels[level].count = data.idioms.filter(item => item.level === Number(level)).length
})
data.version = '1.1.0'

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n')
const dailyPool = data.idioms.filter(item => item.level <= 2).length
console.log('新增', added.length, '条；跳过已存在', skipped, '条；词库总数', data.total, '；每日题池', dailyPool, '条')
