import {
    GetStaticPaths,
    GetStaticProps,
    GetStaticPropsContext,
    InferGetStaticPropsType,
} from "next";
import dynamic from "next/dynamic";
import Head from "next/head";
import React from "react";
import Script from "next/script";

// ==========
// Styles
import styles from "../../../styles/threejs.module.css";

import type { CArmOverlayUIProps } from "../../../components/visualization/NAF/CArmOverlayUI";

// Dynamically import the A-Frame scene component to avoid SSR issues
const CArmScene = dynamic(
  () => import("../../../components/visualization/NAF/CArmScene"),
  { 
    ssr: false,
    loading: () => <div>Loading Scene...</div>
  }
);

// Overlay UI is client-only (Leva/Swiper/NAF/A-Frame are not SSR-friendly)
const CArmOverlayUI = dynamic<CArmOverlayUIProps>(
    () =>
        import("../../../components/visualization/NAF/CArmOverlayUI").then(
            (m) => m.CArmOverlayUI
        ),
    { ssr: false }
);

export const getStaticPaths: GetStaticPaths = async () => {
    return {
        paths: [
            { params: { type: "basic" } },
            { params: { type: "extra" } },
            { params: { type: "tutorial" } },
            { params: { type: "tutorial_en" } },
            { params: { type: "exercise" } },
            { params: { type: "exercise_en" } },
            { params: { type: "perspective" } },
        ],
        fallback: false,
    };
};

export const getStaticProps: GetStaticProps = async ({ params }: GetStaticPropsContext) => {
    const pageType = params!.type;
    const isExtra = pageType === "extra";
    const isTutorial = pageType === "tutorial" || pageType === "tutorial_en";
    const isExercise = pageType === "exercise" || pageType === "exercise_en";
    const isPerspective = pageType === "perspective";
    const isEnglish = pageType === "tutorial_en" || pageType === "exercise_en";
    return {
        props: {
            pageType,
            availables: {
                orthographic: !isPerspective,
                player: isExtra || isTutorial || isExercise || isPerspective,
                shield: isExtra || isTutorial || isExercise || isPerspective,
                dosimeter: isExtra || isTutorial || isExercise || isPerspective,
                experimentUI: isExercise,
                exerciseUI: isExtra || isExercise || isPerspective,
                tutorialUI: isTutorial,
            },
            isEnglish,
        },
    };
};

type PageProps = InferGetStaticPropsType<typeof getStaticProps>;

export default function VisualizationCArmNAF({
    pageType,
    availables,
    isEnglish,
}: PageProps) {
    return (
        <>
            <Head>
                <title>C-Arm NAF Visualization ({pageType})</title>
                <meta
                    name="description"
                    content="Networked A-Frame C-Arm Visualization"
                />
            </Head>

            {/* A-Frame 1.4.2 */}
            {/* Load beforeInteractive so A-Frame is ready for the scene */}
            <Script
                src="https://aframe.io/releases/1.4.2/aframe.min.js"
                strategy="beforeInteractive"
            />

            {/* Socket.io Client */}
            <Script
                src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.1/socket.io.min.js"
                strategy="afterInteractive"
            />

            {/* Networked A-Frame */}
            {/* Must be loaded after A-Frame and Socket.io */}
            <Script
                src="https://unpkg.com/networked-aframe@^0.12.0/dist/networked-aframe.min.js"
                strategy="afterInteractive"
            />

            {/* NAF SocketIO Adapter - Custom Local Script */}
            <Script
                src="/js/naf-socketio-adapter.js"
                strategy="afterInteractive"
            />

            {/* NAF Avatar Animation: 必须在 a-scene/NAF 挂载前注册，否则本地 avatar 克隆时没有该组件 */}
            <Script
                src="/js/avatar-animation-state-machine.js"
                strategy="beforeInteractive"
            />

            <div className={styles.container}>
                <div className={styles.canvas}>
                    <CArmScene />

                    <CArmOverlayUI availables={availables} isEnglish={isEnglish} />
                </div>
            </div>
        </>
    );
}
