import {
    Shield,
    HealthAndSafety,
    SignLanguage,
    HowToReg,
    Person,
    PersonAdd,
    PersonAddAlt1,
    Transcribe,
    Visibility,
    VisibilityOff,
    Sick,
    // BackHand
} from "@mui/icons-material";

import { TipsItem } from "../utils/TipsItemTemplate";
import { applyBasePath } from "../../../../utils";
import type { TipsBaseProps } from "../utils";

export function ScreenStructure({ isEnglish = false }: TipsBaseProps) {
    return (
        <>
            <TipsItem
                title={
                    <>
                        {!isEnglish ? (
                            <h3>画面構成</h3>
                        ) : (
                            <h3>Screen structure</h3>
                        )}
                    </>
                }
                imgSrc={"/img/manual/tips/png/All/screen_all.png "}
                imgAlt={"img/Screen"}
            >
                {!isEnglish ? (
                    <>
                        <p>この教材の画面構成は大きく4つに分かれています。</p>
                        <ul>
                            <li>
                                3D空間：線量分布やプレイヤーなどが表示される
                            </li>
                            <li>
                                操作パネル（画面右部分）：各種設定などの操作を行える
                            </li>
                            <li>
                                目標リスト（画面左上部分）：シナリオなど目標が表示される
                            </li>
                            <li>
                                線量計（画面左下部分）：3D空間内のプレイヤーの位置に応じて値が表示される
                            </li>
                        </ul>
                    </>
                ) : (
                    <>
                        <p>
                            The screen structure of this material is divided
                            into four main sections.
                        </p>
                        <ul>
                            <li>
                                3D space: dose distribution, players, etc. are
                                displayed.
                            </li>
                            <li>
                                Operation panel (right part of the screen):
                                Allows operation of various settings, etc.
                            </li>
                            <li>
                                Goal list (upper left portion of screen):
                                Scenarios and other goals are displayed.
                            </li>
                            <li>
                                Dosimeter (lower left portion of the screen):
                                values are displayed according to the
                                player&apos;s position in the 3D space
                            </li>
                        </ul>
                    </>
                )}
            </TipsItem>
        </>
    );
}

export function Screen3DSpace({ isEnglish = false }: TipsBaseProps) {
    return (
        <>
            <TipsItem
                title={
                    <>
                        {!isEnglish ? (
                            <h3>画面構成 - 3D空間</h3>
                        ) : (
                            <h3>Screen structure - 3D Space</h3>
                        )}
                    </>
                }
            >
                {!isEnglish ? (
                    <>
                        <p>
                            線量分布データや，プレイヤーのとしての3Dオブジェクト，防護板などが表示されます。
                        </p>
                        <p>
                            カメラの操作には
                            <a href="https://threejs.org/docs/#examples/en/controls/OrbitControls">
                                OrbitControls
                            </a>{" "}
                            というコントローラーを採用しています。
                        </p>
                        <ul>
                            <li>左ボタンをドラッグ：回転</li>
                            <li>右ボタンをドラッグ：移動（パン）</li>
                            <li>マウスホイール：ズーム</li>
                        </ul>
                    </>
                ) : (
                    <>
                        <p>
                            Dose distribution data, 3D objects as players, and{" "}
                            protective boards are displayed.
                        </p>
                        <p>
                            The{" "}
                            <a href="https://threejs.org/docs/#examples/en/controls/OrbitControls">
                                OrbitControls
                            </a>{" "}
                            controller is used to control the camera.
                        </p>
                        <ul>
                            <li>Drag the left button: Rotate</li>
                            <li>Right button drag: Pan</li>
                            <li>Mouse wheel: Zoom</li>
                        </ul>
                    </>
                )}
            </TipsItem>
        </>
    );
}

export function ScreenOperationPanel({ isEnglish = false }: TipsBaseProps) {
    return (
        <>
            <TipsItem
                title={
                    <>
                        {!isEnglish ? (
                            <h3>画面構成 - 操作パネル</h3>
                        ) : (
                            <h3>Screen structure - Operation Panel</h3>
                        )}
                    </>
                }
            >
                {!isEnglish ? (
                    <>
                        <p>
                            線量分布データの操作や，線量計UI，3D空間全体などに関係する数値などを操作できるパネルになっています。
                        </p>
                        <p>詳しい内容は，操作マニュアルに記載しています。</p>
                    </>
                ) : (
                    <>
                        <p>
                            The panel allows manipulation of dose distribution
                            data, dosimeter UI, and numerical values related to
                            the entire 3D space, etc.
                        </p>
                        <p>
                            Detailed information is provided in the operation
                            manual.
                        </p>
                    </>
                )}
            </TipsItem>
        </>
    );
}

export function ScreenUIDosimeter1({ isEnglish = false }: TipsBaseProps) {
    return (
        <>
            <TipsItem
                title={
                    <>
                        {!isEnglish ? (
                            <h3>画面構成 - 線量計 (1/3)</h3>
                        ) : (
                            <h3>Screen structure - Dosimeter (1/3)</h3>
                        )}
                    </>
                }
                imgSrc={"/img/manual/tips/png/UI/DosimeterUI/Dosimeter.png"}
                imgAlt={"img/UI/DosimeterUI"}
            >
                {!isEnglish ? (
                    <>
                        <p>
                            プレイヤーに紐付けられた仮想の線量計から被ばく量を取得し表示しています。
                        </p>
                        <p>
                            左側が年間の上限被ばく量(20,000[&micro;Sv])，右側が一回の目標上限被ばく量に対して被ばく量を表しています。
                        </p>
                        <p>
                            左側が年間，右側が一回がデフォルトの順番ですが，操作パネルで左右の順番を変更することが可能です。
                        </p>
                    </>
                ) : (
                    <>
                        <p>
                            The exposure dose is obtained from a virtual
                            dosimeter tied to the player and displayed.
                        </p>
                        <p>
                            The left side shows the annual upper limit exposure
                            dose (20,000[&micro;Sv]), and the right side shows
                            the exposure dose against the target upper limit
                            exposure dose per exposure.
                        </p>
                        <p>
                            The default order is once a year on the left side
                            and once a year on the right side, but the order of
                            left and right can be changed on the operation
                            panel.
                        </p>
                    </>
                )}
            </TipsItem>
        </>
    );
}

export function ScreenUIDosimeter2({ isEnglish = false }: TipsBaseProps) {
    return (
        <>
            <TipsItem
                title={
                    <>
                        {!isEnglish ? (
                            <h3>画面構成 - 線量計 (2/3)</h3>
                        ) : (
                            <h3>Screen structure - Dosimeter (2/3)</h3>
                        )}
                    </>
                }
                imgSrc={
                    "/img/manual/tips/png/UI/DosimeterUI/Dosimeter_all-icon.png"
                }
                imgAlt={"img/UI/DosimeterUIIcon"}
            >
                {!isEnglish ? (
                    <>
                        <p>
                            被ばく量以外にも防護具，防護板の影響を受けた場合，対応するアイコンが表示されます。
                        </p>
                        <p>
                            今回の教材内では，被ばく量に対して防護具で0.1倍，防護板で0.01倍になるようにしています。
                            <br />
                            （防護具は種類によらず，全て0.1倍としています。）
                        </p>
                    </>
                ) : (
                    <>
                        <p>
                            If the exposure dose is affected by protective
                            equipment or protective plates in addition to the
                            exposure dose, the corresponding icon will be
                            displayed.
                        </p>
                        <p>
                            In the present teaching material, the exposure dose
                            is set to 0.1 times for protective equipment and
                            0.01 times for protective plates.
                            <br />
                            (All protective equipment is assumed to be 0.1 times
                            the dose, regardless of type.)
                        </p>
                    </>
                )}
            </TipsItem>
        </>
    );
}

export function ScreenUIDosimeter3({ isEnglish = false }: TipsBaseProps) {
    const color = "#D4875D"; // Orange
    const fontSize = "2rem";
    const iconStyle = {
        display: "block",
        marginLeft: "auto",
        marginRight: "auto",
    };

    return (
        <>
            <TipsItem
                title={
                    <>
                        {!isEnglish ? (
                            <h3>画面構成 - 線量計 (3/3)</h3>
                        ) : (
                            <h3>Screen structure - Dosimeter (3/3)</h3>
                        )}
                    </>
                }
                imgSrc={"/img/manual/tips/gif/leva/Player/Equipments.gif"}
                imgAlt={"gif/leva/Player/Equipments"}
            >
                {!isEnglish ? (
                    <>
                        <p>アイコンの種類は以下の表の通りになっています。</p>
                        <p>また，防護具は3Dモデルにも反映されます。</p>
                        <table>
                            <thead>
                                <tr>
                                    <th>種類</th>
                                    <th>アイコン</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>防護板</td>
                                    <td align={"center"}>
                                        <HealthAndSafety
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>ゴーグル</td>
                                    <td align={"center"}>
                                        <Visibility
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>ネックガード</td>
                                    <td align={"center"}>
                                        <PersonAddAlt1
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>エプロン</td>
                                    <td align={"center"}>
                                        <Person
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>手袋</td>
                                    <td align={"center"}>
                                        <SignLanguage
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </>
                ) : (
                    <>
                        <p>The types of icons are listed in the table below.</p>
                        <p>
                            Protective equipment is also reflected in the 3D
                            model.
                        </p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Icon</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Shield</td>
                                    <td align={"center"}>
                                        <HealthAndSafety
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>Goggle</td>
                                    <td align={"center"}>
                                        <Visibility
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>Neck Guard</td>
                                    <td align={"center"}>
                                        <PersonAddAlt1
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>Apron</td>
                                    <td align={"center"}>
                                        <Person
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>Glove</td>
                                    <td align={"center"}>
                                        <SignLanguage
                                            sx={{
                                                color: color,
                                                fontSize: fontSize,
                                            }}
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </>
                )}
            </TipsItem>
        </>
    );
}
