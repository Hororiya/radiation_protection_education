import React from "react";
import { useControls, folder } from "leva";

// ==========
// Store
import { useStore } from "../../store";

/**
 * Equipments controller.
 */
export function DoseEquipmentsUI({ ...props }) {
    // ==================================================
    // Variable, State
    // --------------------------------------------------
    // useStore
    const [set, equipments] = useStore((state) => [
        state.set,
        state.sceneStates.playerState.equipments,
    ]);

    // --------------------------------------------------
    // Control Panel (value from store so UI and avatar stay in sync)
    const [,] = useControls(() => ({
        Player: folder({
            Equipments: folder({
                Goggle: {
                    value: equipments.goggle,
                    onChange: (e) => {
                        set((state) => ({
                            sceneStates: {
                                ...state.sceneStates,
                                playerState: {
                                    ...state.sceneStates.playerState,
                                    equipments: {
                                        ...state.sceneStates.playerState
                                            .equipments,
                                        goggle: e,
                                    },
                                },
                            },
                        }));

                        // set execute log for experiment
                        if (e) {
                            set((state) => ({
                                sceneStates: {
                                    ...state.sceneStates,
                                    executeLog: {
                                        ...state.sceneStates.executeLog,
                                        dosimeter: {
                                            ...state.sceneStates.executeLog
                                                .dosimeter,
                                            goggle: true,
                                        },
                                    },
                                },
                            }));
                        }
                    },
                },
                NeckGuard: {
                    value: equipments.neck,
                    label: "Neck Guard",
                    onChange: (e) => {
                        set((state) => ({
                            sceneStates: {
                                ...state.sceneStates,
                                playerState: {
                                    ...state.sceneStates.playerState,
                                    equipments: {
                                        ...state.sceneStates.playerState
                                            .equipments,
                                        neck: e,
                                    },
                                },
                            },
                        }));

                        // set execute log for experiment
                        if (e) {
                            set((state) => ({
                                sceneStates: {
                                    ...state.sceneStates,
                                    executeLog: {
                                        ...state.sceneStates.executeLog,
                                        dosimeter: {
                                            ...state.sceneStates.executeLog
                                                .dosimeter,
                                            neckGuard: true,
                                        },
                                    },
                                },
                            }));
                        }
                    },
                },
                Apron: {
                    value: equipments.apron,
                    onChange: (e) => {
                        set((state) => ({
                            sceneStates: {
                                ...state.sceneStates,
                                playerState: {
                                    ...state.sceneStates.playerState,
                                    equipments: {
                                        ...state.sceneStates.playerState
                                            .equipments,
                                        apron: e,
                                    },
                                },
                            },
                        }));

                        // set execute log for experiment
                        if (e) {
                            set((state) => ({
                                sceneStates: {
                                    ...state.sceneStates,
                                    executeLog: {
                                        ...state.sceneStates.executeLog,
                                        dosimeter: {
                                            ...state.sceneStates.executeLog
                                                .dosimeter,
                                            apron: true,
                                        },
                                    },
                                },
                            }));
                        }
                    },
                },
                Glove: {
                    value: equipments.glove,
                    onChange: (e) => {
                        set((state) => ({
                            sceneStates: {
                                ...state.sceneStates,
                                playerState: {
                                    ...state.sceneStates.playerState,
                                    equipments: {
                                        ...state.sceneStates.playerState
                                            .equipments,
                                        glove: e,
                                    },
                                },
                            },
                        }));

                        // set execute log for experiment
                        if (e) {
                            set((state) => ({
                                sceneStates: {
                                    ...state.sceneStates,
                                    executeLog: {
                                        ...state.sceneStates.executeLog,
                                        dosimeter: {
                                            ...state.sceneStates.executeLog
                                                .dosimeter,
                                            glove: true,
                                        },
                                    },
                                },
                            }));
                        }
                    },
                },
            }),
        }),
    }));

    // ==================================================
    // Element
    return <></>;
}
