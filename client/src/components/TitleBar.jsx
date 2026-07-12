import { useState, useEffect } from 'react'
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from 'react-icons/vsc'

export default function TitleBar() {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI

    if (!isElectron) return null

    const handleControl = (action) => {
        window.electronAPI.controlWindow(action)
    }

    return (
        <div className="titlebar">
            <div className="titlebar-logo">
                <span className="titlebar-emoji">🐱</span>
                <span className="titlebar-text">
                    YT Made EZ <span className="titlebar-highlight">Studio</span>
                </span>
            </div>
            <div className="titlebar-drag-region" />
            <div className="titlebar-controls">
                <button className="titlebar-btn minimize" onClick={() => handleControl('minimize')} title="Minimize">
                    <VscChromeMinimize />
                </button>
                <button className="titlebar-btn maximize" onClick={() => handleControl('maximize')} title="Maximize">
                    <VscChromeMaximize />
                </button>
                <button className="titlebar-btn close" onClick={() => handleControl('close')} title="Close">
                    <VscChromeClose />
                </button>
            </div>
        </div>
    )
}
