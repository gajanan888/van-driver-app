import React, { useState } from 'react';
import { supabase } from './supabase';

const Auth = ({ onLogin }) => {
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('login'); // login, signup, verification
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [otp, setOtp] = useState('');

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: displayName,
                },
            },
        });

        if (error) {
            alert(error.message);
        } else {
            alert('Account created successfully!');
            onLogin();
        }
        setLoading(false);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            if (error.message.includes("Email not confirmed")) {
                alert("Email not confirmed! Please check your inbox (and Spam) for a verification link or disable 'Confirm Email' in your Supabase settings.");
            } else {
                alert(error.message);
            }
        } else {
            onLogin();
        }
        setLoading(false);
    };

    return (
        <div className="animate-in" style={{ padding: '20px', maxWidth: '400px', margin: 'auto' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🚌</div>
                <h1 style={{ marginBottom: '5px', fontSize: '1.8rem' }}>SADGURU BUS SERVICES</h1>
                <p style={{ color: 'var(--text-light)', marginBottom: '30px' }}>
                    {view === 'signup' ? 'Service Registration' : 'Welcome Back! Sign In'}
                </p>
            </div>

            <form onSubmit={view === 'signup' ? handleSignup : handleLogin} style={{ textAlign: 'left' }}>
                {view === 'signup' && (
                    <div className="input-group">
                        <label>Service / Owner Name</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Enter full name"
                            required
                        />
                    </div>
                )}

                <div className="input-group">
                    <label>Email Address</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@example.com"
                        required
                    />
                </div>

                <div className="input-group">
                    <label>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a secure password"
                        required
                    />
                </div>

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ width: '100%', marginTop: '20px', padding: '15px' }}
                >
                    {loading ? 'Processing...' : (view === 'signup' ? 'Create Account' : 'Sign In')}
                </button>
            </form>

            <p style={{ marginTop: '25px', textAlign: 'center', fontSize: '0.9rem' }}>
                {view === 'signup' ? 'Already have an account?' : 'Need a new account?'}{' '}
                <button
                    onClick={() => setView(view === 'signup' ? 'login' : 'signup')}
                    style={{ background: 'none', color: 'var(--primary)', fontWeight: 'bold' }}
                >
                    {view === 'signup' ? 'Sign In' : 'Register Now'}
                </button>
            </p>
        </div>
    );
};

export default Auth;
