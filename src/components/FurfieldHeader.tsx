'use client';

import React from 'react';
import Image from 'next/image';

export interface FurfieldHeaderProps {
  showSearch?: boolean;
  showNotifications?: boolean;
  showUserMenu?: boolean;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
  loading?: boolean;
}

export const FurfieldHeader: React.FC<FurfieldHeaderProps> = ({
  showSearch = true,
  showNotifications = true,
  showUserMenu = true,
  userName = 'Loading...',
  userRole = 'Loading...',
  onLogout,
  loading = false,
}) => {
  const displayName = loading ? 'Loading...' : userName;
  const displayRole = loading ? 'Loading...' : userRole;

  return (
    <header className="sticky top-0 z-40 bg-white shadow-md border-b border-gray-200">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          {/* Furfield Branding */}
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10">
              <Image 
                src="/Furfield-icon.png" 
                alt="Furfield Logo" 
                fill
                className="rounded-lg object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">FURFIELD</h1>
              <p className="text-xs text-gray-500">Veterinary Management System</p>
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (
            <div className="relative ml-8">
              <input
                type="search"
                placeholder="Search..."
                aria-label="Search"
                suppressHydrationWarning
                className="w-64 h-10 pl-10 pr-4 rounded-lg border-0 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Notifications */}
          {showNotifications && (
            <button
              className="relative p-2 hover:bg-blue-50 rounded-lg transition-colors"
              aria-label="View notifications"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          )}

          {/* User Menu */}
          {showUserMenu && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-500">{displayRole}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-white font-medium">
                {displayName.charAt(0).toUpperCase()}
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="ml-2 text-sm text-red-600 hover:text-red-800 px-3 py-2 rounded-md hover:bg-red-50 transition-colors"
                >
                  Sign Out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
