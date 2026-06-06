"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Mock chat messages for the animated preview
const PREVIEW_CHAT = [
  { sender: "student", text: "Explain Quantum Superposition like I'm 10." },
  { 
    sender: "tutor", 
    text: "Imagine a coin spinning on a table. While it's spinning, is it heads or tails? It's actually a blur of both at the same time! That 'blur' is superposition." 
  },
  { sender: "student", text: "Whoa. So it only becomes heads or tails when it stops spinning?" },
  { 
    sender: "tutor", 
    text: "Exactly! In physics, we call that 'stopping' a measurement. Until you look, it's a probability blur of all possibilities." 
  }
];

export default function Home() {
  const [chatStep, setChatStep] = useState(0);
  const [activePersona, setActivePersona] = useState("socratic");

  // Cycle through chat messages to simulate active tutoring
  useEffect(() => {
    const timer = setInterval(() => {
      setChatStep((prev) => (prev < PREVIEW_CHAT.length - 1 ? prev + 1 : 0));
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const subjects = [
    {
      title: "Advanced Mathematics",
      desc: "Calculus, linear algebra, and discrete math broken down step-by-step.",
      icon: (
        <svg className="h-6 w-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: "from-violet-600/20 to-purple-600/5",
    },
    {
      title: "Natural Sciences",
      desc: "Explore physics, chemistry, and biology with molecular-level simulations.",
      icon: (
        <svg className="h-6 w-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      color: "from-cyan-600/20 to-teal-600/5",
    },
    {
      title: "World History",
      desc: "Connect civilizational events, structural analysis, and historical timelines.",
      icon: (
        <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h2m-4-3h1.5a2.5 2.5 0 012.5 2.5V12a9 9 0 11-17.945-1M12 2a10 10 0 100 20 10 10 0 000-20z" />
        </svg>
      ),
      color: "from-amber-600/20 to-orange-600/5",
    },
    {
      title: "Literature & Composition",
      desc: "Analyze texts, refine syntax, and write argumentative essays with clarity.",
      icon: (
        <svg className="h-6 w-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
      color: "from-rose-600/20 to-pink-600/5",
    },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden flex flex-col">
      {/* Decorative Glow Elements */}
      <div className="glow-spot bg-primary w-[600px] h-[600px] opacity-10" style={{ top: "-10%", left: "-10%" }} />
      <div className="glow-spot bg-secondary w-[500px] h-[500px] opacity-10" style={{ bottom: "-10%", right: "-10%" }} />

      {/* Header / Navigation */}
      <header className="w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between relative z-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-md shadow-primary/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            Aether<span className="text-secondary">AI</span>
          </span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#subjects" className="hover:text-white transition-colors">Subjects</a>
          <a href="#personas" className="hover:text-white transition-colors">AI Personas</a>
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">
            Sign In
          </Link>
          <Link 
            href="/login" 
            className="hidden sm:inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-md"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-12 md:py-24 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
        
        {/* Left Side: Copywriting & CTA */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="lg:col-span-6 flex flex-col items-start gap-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-primary/10 border border-primary/20 text-white animate-float">
            <span>✨ Introducing Aether AI v2.0</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Learn anything.<br />
            Master <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">everything.</span>
          </h1>
          
          <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
            Aether is an adaptive study companion that uses Socratic dialogue, multi-modal concepts, and interactive simulations to guide you from foundational struggle to deep subject mastery.
          </p>

          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-4">
            <Link 
              href="/login" 
              className="flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-secondary px-8 py-4 text-base font-semibold text-white shadow-xl hover:shadow-primary/20 transition-all hover:scale-[1.02]"
            >
              Start Studying Free
            </Link>
            <Link 
              href="/login" 
              className="flex items-center justify-center rounded-xl bg-white/5 border border-white/8 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 hover:border-white/15 transition-all"
            >
              Explore Subjects
            </Link>
          </div>


        </motion.div>

        {/* Right Side: Interactive AI Chat Simulation Mockup */}
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="lg:col-span-6 w-full max-w-xl mx-auto"
        >
          <div className="w-full glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative">
            
            {/* Window Topbar */}
            <div className="bg-white/5 px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">AI Socratic Tutor</span>
              </div>
              <div className="w-12" />
            </div>

            {/* Simulated Chat Feed */}
            <div className="p-6 min-h-[340px] flex flex-col justify-end gap-5 bg-card/40">
              {PREVIEW_CHAT.slice(0, chatStep + 1).map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}
                >
                  <div 
                    className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm ${
                      msg.sender === "student"
                        ? "bg-primary text-white rounded-br-none shadow-md shadow-primary/10"
                        : "glass-panel text-zinc-100 rounded-bl-none border border-white/5"
                    }`}
                  >
                    <p className="leading-relaxed">{msg.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Window Input Bar Mock */}
            <div className="bg-white/5 p-4 border-t border-white/8 flex items-center justify-between gap-3">
              <div className="flex-1 bg-white/5 rounded-xl px-4 py-2.5 text-xs text-muted-foreground border border-white/5">
                Type your follow-up question here...
              </div>
              <button className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-md">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>

          </div>
        </motion.div>

      </main>

      {/* Subjects Section */}
      <section id="subjects" className="border-t border-white/5 bg-black/40 py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold text-white">Study Curriculums Built for Mastery</h2>
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
              We cover high school and undergraduate course syllabi. Select a track to study with specialized agents trained on curriculum standards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {subjects.map((sub, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -6, borderColor: "rgba(255, 255, 255, 0.15)" }}
                className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between group transition-all duration-300"
              >
                <div className="space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-primary/10 transition-colors">
                    {sub.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">{sub.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sub.desc}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-secondary group-hover:text-white transition-colors">
                  <span>Start Curriculum</span>
                  <svg className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 bg-black/80 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold">AetherAI</span> © {new Date().getFullYear()} School AI Inc.
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Terms of Use</a>
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
