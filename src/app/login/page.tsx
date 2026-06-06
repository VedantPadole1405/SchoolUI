"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { isFirebaseEnabled, auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function Login() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [enrollCourseId, setEnrollCourseId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);

  // Parse enrollment query parameters on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const courseIdParam = params.get("enrollCourseId");
      const teacherIdParam = params.get("teacherId");
      if (courseIdParam && teacherIdParam) {
        setEnrollCourseId(courseIdParam);
        setTeacherId(teacherIdParam);
        sessionStorage.setItem("pending_enroll_course_id", courseIdParam);
        sessionStorage.setItem("pending_enroll_teacher_id", teacherIdParam);
      } else {
        const savedCourseId = sessionStorage.getItem("pending_enroll_course_id");
        const savedTeacherId = sessionStorage.getItem("pending_enroll_teacher_id");
        if (savedCourseId && savedTeacherId) {
          setEnrollCourseId(savedCourseId);
          setTeacherId(savedTeacherId);
        }
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (activeTab === "signup" && !name)) {
      setError("Please fill out all fields.");
      return;
    }
    setError("");
    setLoading(true);

    if (isFirebaseEnabled && auth && db) {
      try {
        if (activeTab === "signup") {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          const user = userCredential.user;
          
          let studentInstructorId = "";
          let studentInstructorName = "";
          let studentEnrolledCourse = "";
          let studentEnrolledCourseId = "";

          if (role === "student" && teacherId && enrollCourseId) {
            const teacherDoc = await getDoc(doc(db, "users", teacherId));
            if (teacherDoc.exists()) {
              const teacherData = teacherDoc.data();
              studentInstructorId = teacherId;
              studentInstructorName = teacherData.name;
              const teacherSubjects = teacherData.subjects || [];
              const course = teacherSubjects.find((s: any) => s.id === enrollCourseId);
              studentEnrolledCourse = course ? course.name : "Mathematics";
              studentEnrolledCourseId = enrollCourseId;
            }
          }

          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: name,
            email: email,
            role: role,
            createdAt: new Date().toISOString(),
            xp: role === "student" ? 0 : undefined,
            streak: role === "student" ? 0 : undefined,
            gmatScore: role === "student" ? 500 : undefined,
            classScore: role === "student" ? 0 : undefined,
            instructorId: studentInstructorId,
            instructorName: studentInstructorName,
            enrolledCourse: studentEnrolledCourse,
            enrolledCourseId: studentEnrolledCourseId,
            recentActivity: []
          });
          
          localStorage.setItem("user_role", role);
          localStorage.setItem("mock_current_user_uid", user.uid);
          sessionStorage.removeItem("pending_enroll_course_id");
          sessionStorage.removeItem("pending_enroll_teacher_id");
        } else {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          const user = userCredential.user;
          
          const userDoc = await getDoc(doc(db, "users", user.uid));
          let finalRole = role;
          if (userDoc.exists()) {
            const userData = userDoc.data();
            finalRole = userData.role || role;

            if (finalRole === "student" && teacherId && enrollCourseId) {
              const teacherDoc = await getDoc(doc(db, "users", teacherId));
              if (teacherDoc.exists()) {
                const teacherData = teacherDoc.data();
                const teacherSubjects = teacherData.subjects || [];
                const course = teacherSubjects.find((s: any) => s.id === enrollCourseId);
                const courseName = course ? course.name : "Mathematics";
                
                await setDoc(doc(db, "users", user.uid), {
                  instructorId: teacherId,
                  instructorName: teacherData.name,
                  enrolledCourse: courseName,
                  enrolledCourseId: enrollCourseId
                }, { merge: true });
              }
            }
          }
          
          localStorage.setItem("user_role", finalRole);
          localStorage.setItem("mock_current_user_uid", user.uid);
          sessionStorage.removeItem("pending_enroll_course_id");
          sessionStorage.removeItem("pending_enroll_teacher_id");
        }
        
        router.push("/dashboard");
      } catch (err: any) {
        console.error("Firebase Auth failed:", err);
        setError(err.message || "Authentication failed. Please check your credentials.");
      } finally {
        setLoading(false);
      }
    } else {
      // Simulate login fallback with localStorage Mock Database
      setTimeout(() => {
        const mockUsersJSON = localStorage.getItem("aether_mock_users");
        let mockUsers = mockUsersJSON ? JSON.parse(mockUsersJSON) : [];
        
        // Pre-populate if empty
        if (mockUsers.length === 0) {
          mockUsers = [
            {
              uid: "mock-student-alex",
              email: "alex@school.edu",
              password: "password",
              name: "Alex Mercer",
              role: "student",
              xp: 380,
              streak: 5,
              gmatScore: 580,
              classScore: 75,
              instructorId: "mock-teacher-emily",
              instructorName: "Prof. Emily Vance",
              enrolledCourse: "Mathematics",
              enrolledCourseId: "math",
              recentActivity: [
                {
                  questionText: "What is the derivative of the function f(x) = 5x^3 + 2x^2 - 7 at the point x = 1?",
                  level: 2,
                  userAnswer: "19",
                  correctAnswer: "19",
                  isCorrect: true,
                  hintsRequested: 1,
                  timestamp: "02:15 PM"
                }
              ]
            },
            {
              uid: "mock-teacher-emily",
              email: "emily@school.edu",
              password: "password",
              name: "Prof. Emily Vance",
              role: "teacher",
              activeAssignment: {
                subject: "math",
                level: 2,
                focus: "Derivatives review",
                maxQuestions: 10,
                timestamp: new Date().toISOString()
              }
            }
          ];
          localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
        }

        if (activeTab === "signup") {
          const existingUser = mockUsers.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
          if (existingUser) {
            setError("An account with this email already exists.");
            setLoading(false);
            return;
          }

          let studentInstructorId = "";
          let studentInstructorName = "";
          let studentEnrolledCourse = "";
          let studentEnrolledCourseId = "";

          if (role === "student" && teacherId && enrollCourseId) {
            const teacherUser = mockUsers.find((u: any) => u.uid === teacherId);
            if (teacherUser) {
              studentInstructorId = teacherId;
              studentInstructorName = teacherUser.name;
              
              const teacherSubjectsJSON = localStorage.getItem(`aether_subjects_${teacherId}`);
              const teacherSubjects = teacherSubjectsJSON ? JSON.parse(teacherSubjectsJSON) : [];
              const course = teacherSubjects.find((s: any) => s.id === enrollCourseId);
              studentEnrolledCourse = course ? course.name : "Mathematics";
              studentEnrolledCourseId = enrollCourseId;
            }
          }

          const newUser = {
            uid: `mock-user-${Date.now()}`,
            name,
            email,
            password,
            role,
            createdAt: new Date().toISOString(),
            xp: role === "student" ? 0 : undefined,
            streak: role === "student" ? 0 : undefined,
            gmatScore: role === "student" ? 500 : undefined,
            classScore: role === "student" ? 0 : undefined,
            instructorId: studentInstructorId,
            instructorName: studentInstructorName,
            enrolledCourse: studentEnrolledCourse,
            enrolledCourseId: studentEnrolledCourseId,
            recentActivity: []
          };
          mockUsers.push(newUser);
          localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
          localStorage.setItem("user_role", role);
          localStorage.setItem("mock_current_user_uid", newUser.uid);
          
          sessionStorage.removeItem("pending_enroll_course_id");
          sessionStorage.removeItem("pending_enroll_teacher_id");
          router.push("/dashboard");
        } else {
          let foundUser = mockUsers.find(
            (u: any) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
          );
          if (foundUser) {
            if (foundUser.role === "student" && teacherId && enrollCourseId) {
              const teacherUser = mockUsers.find((u: any) => u.uid === teacherId);
              if (teacherUser) {
                foundUser.instructorId = teacherId;
                foundUser.instructorName = teacherUser.name;
                const teacherSubjectsJSON = localStorage.getItem(`aether_subjects_${teacherId}`);
                const teacherSubjects = teacherSubjectsJSON ? JSON.parse(teacherSubjectsJSON) : [];
                const course = teacherSubjects.find((s: any) => s.id === enrollCourseId);
                foundUser.enrolledCourse = course ? course.name : "Mathematics";
                foundUser.enrolledCourseId = enrollCourseId;

                mockUsers = mockUsers.map((u: any) => u.uid === foundUser.uid ? foundUser : u);
                localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
              }
            }

            localStorage.setItem("user_role", foundUser.role);
            localStorage.setItem("mock_current_user_uid", foundUser.uid);
            
            sessionStorage.removeItem("pending_enroll_course_id");
            sessionStorage.removeItem("pending_enroll_teacher_id");
            router.push("/dashboard");
          } else {
            setError("Invalid email or password. (Hint: use alex@school.edu / password or emily@school.edu / password)");
          }
        }
        setLoading(false);
      }, 1000);
    }
  };

  const handleDemoLogin = (role: "student" | "teacher") => {
    setLoading(true);
    localStorage.setItem("user_role", role);
    if (role === "student") {
      localStorage.setItem("mock_current_user_uid", "mock-student-alex");
    } else {
      localStorage.setItem("mock_current_user_uid", "mock-teacher-emily");
    }
    // Set up mock users if they don't exist yet
    const mockUsersJSON = localStorage.getItem("aether_mock_users");
    if (!mockUsersJSON) {
      const defaultUsers = [
        {
          uid: "mock-student-alex",
          email: "alex@school.edu",
          password: "password",
          name: "Alex Mercer",
          role: "student",
          xp: 380,
          streak: 5,
          gmatScore: 580,
          classScore: 75,
          instructorId: "mock-teacher-emily",
          instructorName: "Prof. Emily Vance",
          recentActivity: [
            {
              questionText: "What is the derivative of the function f(x) = 5x^3 + 2x^2 - 7 at the point x = 1?",
              level: 2,
              userAnswer: "19",
              correctAnswer: "19",
              isCorrect: true,
              hintsRequested: 1,
              timestamp: "02:15 PM"
            }
          ]
        },
        {
          uid: "mock-teacher-emily",
          email: "emily@school.edu",
          password: "password",
          name: "Prof. Emily Vance",
          role: "teacher",
          activeAssignment: {
            subject: "math",
            level: 2,
            focus: "Derivatives review",
            maxQuestions: 10,
            timestamp: new Date().toISOString()
          }
        }
      ];
      localStorage.setItem("aether_mock_users", JSON.stringify(defaultUsers));
    }
    setTimeout(() => {
      setLoading(false);
      router.push("/dashboard");
    }, 800);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center px-4 py-12 bg-background overflow-hidden font-sans">
      {/* Decorative Blur Spheres */}
      <div 
        className="glow-spot animate-pulse-slow bg-primary w-[300px] h-[300px] sm:w-[500px] sm:h-[500px]" 
        style={{ top: "10%", left: "-10%", filter: "blur(130px)" }}
      />
      <div 
        className="glow-spot animate-pulse-slow bg-secondary w-[280px] h-[280px] sm:w-[450px] sm:h-[450px]" 
        style={{ bottom: "5%", right: "-10%", filter: "blur(130px)" }}
      />
      
      {/* Logo Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8 flex flex-col items-center gap-2 relative z-10"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-white bg-clip-text">
            Aether<span className="text-secondary">AI</span>
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Your Personal Adaptive Study Companion</p>
      </motion.div>

      {/* Main Form Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-md glass-panel rounded-2xl p-8 relative z-10 shadow-2xl border border-white/10"
      >
        {enrollCourseId && (
          <div className="mb-6 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-200 text-xs font-semibold text-center animate-pulse-slow">
            🔗 Ready to enroll in course (ID: {enrollCourseId}) upon account access!
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="relative mb-8 flex rounded-lg bg-white/5 p-1">
          <button
            onClick={() => { setActiveTab("signin"); setError(""); }}
            className={`relative flex-1 py-2 text-sm font-medium transition-colors ${
              activeTab === "signin" ? "text-white" : "text-muted-foreground hover:text-white"
            }`}
          >
            {activeTab === "signin" && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 rounded-md bg-white/10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            Sign In
          </button>
          <button
            onClick={() => { setActiveTab("signup"); setError(""); }}
            className={`relative flex-1 py-2 text-sm font-medium transition-colors ${
              activeTab === "signup" ? "text-white" : "text-muted-foreground hover:text-white"
            }`}
          >
            {activeTab === "signup" && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 rounded-md bg-white/10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            Sign Up
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <AnimatePresence mode="popLayout">
            {activeTab === "signup" && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</label>
                  <input
                    type="text"
                    placeholder="Alex Mercer"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm glass-input focus:outline-none transition-all duration-200"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("student")}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all border ${
                        role === "student"
                          ? "border-primary bg-primary/10 text-white"
                          : "border-white/5 bg-white/5 text-muted-foreground hover:text-white"
                      }`}
                    >
                      <span>🎒</span> Student
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("teacher")}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all border ${
                        role === "teacher"
                          ? "border-secondary bg-secondary/10 text-white"
                          : "border-white/5 bg-white/5 text-muted-foreground hover:text-white"
                      }`}
                    >
                      <span>🎓</span> Teacher
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</label>
            <input
              type="email"
              placeholder="alex@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm glass-input focus:outline-none transition-all duration-200"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
              {activeTab === "signin" && (
                <a href="#" className="text-xs text-secondary hover:underline">Forgot?</a>
              )}
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm glass-input focus:outline-none transition-all duration-200"
              required
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-red-400 font-medium"
            >
              {error}
            </motion.div>
          )}

          {/* Action Button */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading}
            className="relative w-full rounded-xl py-3 text-sm font-semibold text-white shadow-lg overflow-hidden bg-gradient-to-r from-primary to-secondary transition-all hover:shadow-primary/20 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : activeTab === "signin" ? (
              "Sign In"
            ) : (
              role === "student" ? "Create Student Account" : "Create Teacher Account"
            )}
          </motion.button>
        </form>

        {/* Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute w-full border-t border-white/5" />
          <span className="relative bg-card px-3 text-xs text-muted-foreground uppercase tracking-wider">or continue with</span>
        </div>

        {/* Social Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button className="flex items-center justify-center rounded-xl py-2.5 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all">
            {/* Google */}
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.37 3.65 1.39 7.56l3.85 2.99C6.18 7.37 8.89 5.04 12 5.04z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.43c-.28 1.44-1.1 2.66-2.33 3.49l3.62 2.81c2.12-1.95 3.77-4.82 3.77-8.45z" />
              <path fill="#FBBC05" d="M5.24 14.75c-.24-.72-.38-1.5-.38-2.31s.14-1.59.38-2.31L1.39 7.14C.5 8.94 0 10.91 0 13s.5 4.06 1.39 5.86l3.85-3.11z" />
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.62-2.81c-1.1.74-2.51 1.18-4.34 1.18-3.11 0-5.82-2.33-6.76-5.51L1.39 16c1.98 3.91 5.96 6.56 10.61 6.56z" />
            </svg>
          </button>
          <button className="flex items-center justify-center rounded-xl py-2.5 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all">
            {/* GitHub */}
            <svg className="h-5 w-5 text-white fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
          </button>
          <button className="flex items-center justify-center rounded-xl py-2.5 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all">
            {/* Microsoft */}
            <svg className="h-5 w-5" viewBox="0 0 23 23">
              <path fill="#f35325" d="M0 0h11v11H0z" />
              <path fill="#81bc06" d="M12 0h11v11H12z" />
              <path fill="#05a6f0" d="M0 12h11v11H0z" />
              <path fill="#ffba08" d="M12 12h11v11H12z" />
            </svg>
          </button>
        </div>

        {/* Demo Fast Login */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => handleDemoLogin("student")}
            disabled={loading}
            className="flex-1 text-xs font-semibold text-secondary hover:text-secondary-foreground hover:bg-secondary/15 px-3 py-2.5 rounded-xl border border-secondary/30 transition-all duration-200"
          >
            🚀 Quick Student Demo
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin("teacher")}
            disabled={loading}
            className="flex-1 text-xs font-semibold text-primary hover:text-primary-foreground hover:bg-primary/15 px-3 py-2.5 rounded-xl border border-primary/30 transition-all duration-200"
          >
            🎓 Quick Teacher Demo
          </button>
        </div>
      </motion.div>
    </div>
  );
}
