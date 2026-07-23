"use client";
import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3006";

export default function Home() {
  const [activeRole, setActiveRole] = useState("Supervisor");
  const [records, setRecords] = useState([]);
  const [file, setFile] = useState(null);
  const [aiResult, setAiResult] = useState("");

  const [permissions, setPermissions] = useState({
    Student: { canViewList: true, canCrud: false, canUploadFile: false },
    School: { canViewList: true, canCrud: true, canUploadFile: true },
    Company: { canViewList: false, canCrud: false, canUploadFile: true },
  });

  const togglePermission = (role, permType) => {
    setPermissions((prev) => ({
      ...prev,
      [role]: { ...prev[role], [permType]: !prev[role][permType] },
    }));
  };

  const fetchRecords = async () => {
    try {
      const res = await fetch(`${API_URL}/records`);
      const data = await res.json();
      setRecords(data);
    } catch (error) {
      console.error("Could not reach the database!", error);
    }
  };

  const runAiAnalysis = async () => {
    if (!file) return alert("Please select a file first!");

    setAiResult("AI is reading the file, please wait... ⏳");
    const formData = new FormData();
    formData.append("document", file);

    try {
      const res = await fetch(`${API_URL}/ai-analyze`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setAiResult(data.aiAnalysis || "An error occurred.");
    } catch (error) {
      setAiResult("Could not reach the backend. Is the server running?");
    }
  };

  const sendTask = async () => {
    try {
      const res = await fetch(`${API_URL}/rpc-test`);
      const data = await res.json();
      alert("Task completed!\nResponse: " + data.response);
      fetchRecords();
    } catch (error) {
      alert("Could not reach the server!");
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">

      {/* Role selector */}
      <div className="max-w-6xl mx-auto bg-gray-800 p-6 rounded-xl shadow-lg mb-8 border border-gray-700">
        <h1 className="text-2xl font-bold text-center text-blue-400 mb-6">👑 Select the Role to Log In As</h1>
        <div className="flex flex-wrap justify-center gap-4">
          {["Supervisor", "Student", "School", "Company"].map((role) => (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                activeRole === role
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/50 scale-105"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {role} Panel
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto">

        {/* Supervisor panel */}
        {activeRole === "Supervisor" && (
          <div className="bg-gray-800 p-8 rounded-xl shadow-lg border border-yellow-600/50">
            <h2 className="text-3xl font-bold text-yellow-500 mb-2">⚙️ Supervisor Control Center</h2>
            <p className="text-gray-400 mb-8">Assign each role&apos;s screen features and CRUD operations from here.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {["Student", "School", "Company"].map((role) => (
                <div key={role} className="bg-gray-700 p-6 rounded-lg border border-gray-600">
                  <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">
                    {role} Permissions
                  </h3>

                  <div className="flex justify-between items-center mb-4">
                    <span>1. List View:</span>
                    <button onClick={() => togglePermission(role, "canViewList")} className={`px-3 py-1 rounded text-sm font-bold ${permissions[role].canViewList ? "bg-green-500" : "bg-red-500"}`}>
                      {permissions[role].canViewList ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <span>2. CRUD Operations:</span>
                    <button onClick={() => togglePermission(role, "canCrud")} className={`px-3 py-1 rounded text-sm font-bold ${permissions[role].canCrud ? "bg-green-500" : "bg-red-500"}`}>
                      {permissions[role].canCrud ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="flex justify-between items-center">
                    <span>3. File & AI:</span>
                    <button onClick={() => togglePermission(role, "canUploadFile")} className={`px-3 py-1 rounded text-sm font-bold ${permissions[role].canUploadFile ? "bg-green-500" : "bg-red-500"}`}>
                      {permissions[role].canUploadFile ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Role panels */}
        {activeRole !== "Supervisor" && (
          <div className="bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-3xl font-bold text-blue-400 mb-6">
              👋 Welcome, {activeRole}!
            </h2>

            <div className="space-y-6">

              {/* List screen */}
              <div className={`p-6 rounded-lg border ${permissions[activeRole].canViewList ? "bg-gray-700 border-green-500/30" : "bg-red-900/20 border-red-500/30 text-red-400"}`}>
                <h3 className="text-xl font-bold mb-4">📋 General List Screen (PostgreSQL Data)</h3>
                {permissions[activeRole].canViewList ? (
                  <div className="bg-gray-900 p-4 rounded h-48 overflow-y-auto font-mono text-sm text-green-400">
                    {records.length > 0 ? (
                      records.map((r) => (
                        <div key={r.id} className="mb-2 border-b border-gray-700 pb-1">
                          <span className="text-blue-300">ID: {r.id}</span> | Date: {new Date(r.kayit_tarihi || r.date).toLocaleString()} | Data: {JSON.stringify(r.veri || r.value)}
                        </div>
                      ))
                    ) : (
                      <p>No records found.</p>
                    )}
                  </div>
                ) : (
                  <p>❌ The Supervisor has restricted your access to this screen!</p>
                )}
              </div>

              {/* CRUD / RabbitMQ screen */}
              <div className={`p-6 rounded-lg border ${permissions[activeRole].canCrud ? "bg-gray-700 border-green-500/30" : "bg-red-900/20 border-red-500/30 text-red-400"}`}>
                <h3 className="text-xl font-bold mb-4">✏️ Operation (CRUD) and RabbitMQ Screen</h3>
                {permissions[activeRole].canCrud ? (
                  <div className="flex gap-4">
                    <button onClick={sendTask} className="bg-green-600 hover:bg-green-500 px-6 py-3 rounded-lg font-bold text-white shadow-lg flex items-center gap-2">
                      🐇 Add New Data (RabbitMQ RPC)
                    </button>
                  </div>
                ) : (
                  <p>❌ You do not have permission to add data or use RabbitMQ!</p>
                )}
              </div>

              {/* File upload / AI screen */}
              <div className={`p-6 rounded-lg border ${permissions[activeRole].canUploadFile ? "bg-gray-700 border-green-500/30" : "bg-red-900/20 border-red-500/30 text-red-400"}`}>
                <h3 className="text-xl font-bold mb-4">🤖 File Upload and AI Analysis</h3>
                {permissions[activeRole].canUploadFile ? (
                  <div className="flex flex-col gap-4">
                    <input
                      type="file"
                      onChange={(e) => setFile(e.target.files[0])}
                      accept=".txt,.png,.pdf,.doc,.docx"
                      className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500"
                    />
                    <button onClick={runAiAnalysis} className="bg-purple-600 hover:bg-purple-500 px-6 py-3 rounded-lg font-bold text-white shadow-lg self-start">
                      ✨ Send File to Gemini AI
                    </button>
                    {aiResult && (
                      <div className="mt-4 p-4 bg-gray-900 rounded font-mono text-sm text-purple-300 whitespace-pre-wrap">
                        {aiResult}
                      </div>
                    )}
                  </div>
                ) : (
                  <p>❌ The Supervisor has restricted file upload and AI features for you!</p>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
