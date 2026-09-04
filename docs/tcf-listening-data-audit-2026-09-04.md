# TCF 听力题库数据问题清单

日期：2026-09-04
背景：批量给 A1/A2 听力题（250 题范围）写讲解时，15 题的原始数据本身有问题，写了讲解也是错的，先跳过。这里按问题类型列出，附数据库现状和我的判断依据，供回去对照原始 TCF 试卷 PDF 校对。

跳过的题目一律 `explanation` 为 null，不影响其余 235 题已经写好的讲解。

---

## 1. 答案标注内部矛盾（3 题）

选项里有一个逻辑通顺、明显该选的答案，但数据库标的 `answer` 指向另一个说不通的选项。三题模式几乎一样：一个"接受邀请/建议"的干净说法（常以 `Pourquoi pas` 开头）没被选中，标的却是自相矛盾的那个。

| 定位 | 音频 | 四个选项（`answer` 指向标 ⭐） | 我认为该选的 |
|---|---|---|---|
| **CO-T3-Q7** | `/media/tcf/audio/test3/A2/q07.mp3` | ⭐A. Oui, mais tu ne viens pas.<br>B. Non, moi j'aime bien nager.<br>C. Non, j'ai envie de nager.<br>D. Oui, pourquoi pas. | **D**——邀请去游泳池（"On se retrouve à la piscine?"），D 是唯一干脆的"好啊"；A 说"是，但你不来"逻辑不通（问的人本来就该来） |
| **CO-T23-Q8** | `/media/tcf/audio/test23/A2/q08.mp3` | ⭐A. Bien sûr, je déteste les animaux.<br>B. D'accord, le spectacle est complet.<br>C. Non, la réservation est obligatoire.<br>D. Pourquoi pas ? C'est un beau cadeau. | **D**——问"带侄女去马戏团怎么样"，A"当然，我讨厌动物"自相矛盾（讨厌动物却说"当然"赞成带去看马戏） |
| **CO-T24-Q10** | `/media/tcf/audio/test24/A2/q10.mp3` | ⭐A. C'est pour ses 18 ans.<br>B. Il veut une écharpe en laine.<br>C. Je le trouve sympa.<br>D. On y va en voiture. | **B**——问"Tom 生日能送他什么"，A"这是他 18 岁生日"答的是"为什么送"不是"送什么"；见下方 §2，T3-Q8 就是同一题、标的正是 B |

---

## 2. 同一道题在两套试卷里出现，但答案互相矛盾（2 组）

内容（transcript + 四个选项）逐字或近乎逐字相同，说明这是题库里被复用的同一道原始题，但两次导入标注了不同的 `answer` 下标。两边不可能同时对，只能有一个是对的。

| 组 | 定位 A | 定位 B | 判断 |
|---|---|---|---|
| 火车买报纸 | **CO-T19-Q8** → answer=C "Non, le train est déjà là." | **CO-T21-Q8** → answer=A "Non, le train est annulé." | 倾向 **T19 的 C**："火车已经到站"能解释"没时间"；"取消了"反而意味着不用赶，逻辑对不上"没时间" |
| Tom 生日礼物 | **CO-T3-Q8** → answer=B "Il veut une écharpe en laine." | **CO-T24-Q10** → answer=A "C'est pour ses 18 ans." | 已按 **T3 的 B** 写好讲解（见 §1 的分析） |

（讲解库里已经按"倾向"那一侧写了，另一侧的 locator 保持未写。）

---

## 3. 图文错配（5 题，全部集中在 Test 28）

`imagePath` 指向的图片内容和四个选项完全不搭。用哈希比对发现，Test 28 至少两张图和 Test 21 / Test 24 的图片是**同一张图片文件被错配到了不同的题目**——像是这套试卷的图片在导入阶段被打乱了顺序。

| 定位 | 图片路径 | 选项主题 | 问题 |
|---|---|---|---|
| **CO-T28-Q6** | `test28/q06.png` | 医嘱/体检（"Respirez bien fort" 等） | 图实际是餐厅门口场景，与 `test24/q02.png` **字节级哈希相同**——两题的图被对调了 |
| **CO-T28-Q7** | `test28/q07.png` | 餐厅（"Je voudrais une table..." 等） | 图实际是电影院走道场景，完全没有餐厅元素 |
| **CO-T28-Q5** | `test28/q05.png` | 天气/经济指数/画作（"Les indices économiques sont bons" 等） | 图实际是医生检查病人背部的场景，应该配的是"体检"类选项（比对 `test21/q02.png`，同一场景） |
| **CO-T28-Q3** | `test28/q03.png` | 公交/狗/票（"Quand passe le prochain bus?" 等） | 图是博物馆/展览排队场景，四个选项没有一个贴切；标的 A"Je peux m'asseoir ici?"（画面里没有座位） |
| **CO-T20-Q2** | `test20/q02.png` | 打招呼/给包/吃点心/喝茶 | 图中大人递给孩子的物件形状模糊（像鞋或手包），四个选项没有一个能确认贴合；标的 A "Dis bonjour à ta sœur" 与画面（茶具、点心）不太吻合，但也没有更明显吻合的选项 |

**建议**：Test 28 的图片错配範圍可能不止这 4 题，值得把整套试卷的图片重新核对一遍来源 PDF；`test20/q02.png` 这题更接近"看不清楚"而非"确认错配"，可以先按较低优先级处理。

---

## 4. 语义类型答非所问（2 题）

问题词（"comment"）明确要求某一类答案（方式/方法），但标的答案属于完全不同的类别，同一组选项里有另一个选项才是真正贴合问题词的。

| 定位 | 音频 | 问题 | 四个选项 | 标的 vs 该选 |
|---|---|---|---|---|
| **CO-T29-Q5** | `/media/tcf/audio/test29/A2/q05.mp3` | "Comment voulez-vous voyager?"（想怎么去？= 问交通方式） | ⭐A. Je pars le 12 mars.<br>B. Je préfère l'avion.<br>C. Je reste deux jours.<br>D. Je vais à Paris. | 标 A（日期，答的是"何时"）；应该是 **B**（"坐飞机"，唯一的交通方式） |
| **CO-T36-Q10** | `/media/tcf/audio/test36/A2/q10.mp3` | "Comment on fait pour aller chez toi?"（怎么去你家？= 问路线/交通） | ⭐A. Tu apportes quelque chose à boire.<br>B. Tu arrives vers 20h30.<br>C. Tu descends au dernier arrêt du bus 78.<br>D. Tu peux venir avec ta sœur si tu veux. | 标 A（带饮料，答非所问）；应该是 **C**（"坐 78 路车到终点站下"，唯一的路线答案）。同样的问法在 T26-Q10 / T14-Q8 都标了公交路线那个选项 |

---

## 5. 缺图（4 题）

`type` 是 `image`，但 `imagePath` 字段本身是 `null`——不是错配，是这几题的图片从未导入。

| 定位 | 音频 | 四个选项主题 |
|---|---|---|
| **CO-T16-Q1** | `/media/tcf/audio/test16/A1/q01.mp3` | Pierre 在做什么（装饰房子/洗碗/准备腿/接单） |
| **CO-T28-Q8** | `/media/tcf/audio/test28/A2/q08.mp3` | 演员/广告/买票/坐下看 |
| **CO-T36-Q1** | `/media/tcf/audio/test36/A1/q01.mp3` | 别吵架/吃完点心/回家/从床底出来 |
| **CO-T36-Q2** | `/media/tcf/audio/test36/A1/q02.mp3` | 蔬菜商/问地图/省府入口/停车场 |

---

## 汇总

| 类型 | 题数 | 定位 |
|---|---|---|
| 答案自相矛盾 | 3 | T3-Q7, T23-Q8, T24-Q10（同时也是跨卷冲突的一方，见下一行） |
| 跨卷答案冲突（增量） | 1 | T21-Q8（与 T19-Q8 冲突；T24-Q10 已计入上一行） |
| 图文错配 | 5 | T28-Q3, T28-Q5, T28-Q6, T28-Q7, T20-Q2 |
| 答非所问 | 2 | T29-Q5, T36-Q10 |
| 缺图 | 4 | T16-Q1, T28-Q8, T36-Q1, T36-Q2 |
| **合计** | **15** | |

修复路径：这些都不是"重新讲一遍"能解决的，需要回去对照原始 TCF 试卷 PDF（`TCF_LISTENING_DIR` 指向的源文件）逐题核对 `answer` 下标和图片文件名，改完后我可以照常把讲解补上。
