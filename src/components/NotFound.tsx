import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileQuestion, Home, LogIn } from 'lucide-react';

const NotFound: React.FC = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
            <FileQuestion className="w-12 h-12 text-slate-500" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Page not found</h1>
          <p className="text-slate-500 text-sm">
            The address <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{location.pathname || '/'}</span> doesn’t match any route.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
