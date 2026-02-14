import React, { useState, useEffect } from 'react';
import useStorage from './useStorage';
import { supabase } from './supabase';
import Auth from './Auth';
import ThemeToggle from './ThemeToggle';

const PaymentModal = ({ isOpen, onClose, student, amount, setAmount, onConfirm }) => {
  if (!isOpen || !student) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '10px' }}>Receive Payment</h2>
        <p style={{ color: 'var(--text-light)', marginBottom: '20px' }}>
          Enter amount received from <b>{student.name}</b>
        </p>

        <form onSubmit={onConfirm}>
          <div className="input-group">
            <label>Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 500"
              autoFocus
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Pending</div>
              <div style={{ fontWeight: 'bold', color: 'var(--danger)' }}>₹{student.pendingFees}</div>
            </div>
            <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>After Payment</div>
              <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>
                ₹{Math.max(0, student.pendingFees - (Number(amount) || 0))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Confirm Payment</button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const BulkMessageModal = ({ isOpen, onClose, queue, onProcessNext, onSkip }) => {
  if (!isOpen || !queue || queue.length === 0) return null;
  const current = queue[0];

  return (
    <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="modal-content pulsing-border" style={{ textAlign: 'center', padding: '40px 30px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>⚡</div>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '10px' }}>Quick-Fire Mode</h2>
        <p style={{ color: 'var(--text-light)', marginBottom: '30px' }}>
          Sending reminders ({queue.length} left)
        </p>

        <div className="card" style={{ background: 'var(--bg)', border: '2px solid var(--primary)', marginBottom: '30px', padding: '25px' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '1px' }}>Next Parent</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '10px 0', color: 'var(--text)' }}>{current.name}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>Pending: <span style={{ color: 'var(--danger)' }}>₹{current.pendingFees}</span></div>
        </div>

        <button
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '20px',
            fontSize: '1.3rem',
            marginBottom: '15px',
            boxShadow: '0 10px 20px rgba(99, 102, 241, 0.4)'
          }}
          onClick={onProcessNext}
        >
          Open WhatsApp 🟢
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <button className="btn btn-secondary" style={{ padding: '15px' }} onClick={onSkip}>Skip Student</button>
          <button className="btn btn-danger" style={{ padding: '15px', background: 'transparent', border: 'none', color: 'var(--text-light)' }} onClick={onClose}>Stop Sending</button>
        </div>

        <p style={{ marginTop: '25px', fontSize: '0.85rem', color: 'var(--text-light)', fontStyle: 'italic' }}>
          Tap the blue button, send the message in WhatsApp, then come back here for the next one!
        </p>
      </div>
    </div>
  );
};

const App = () => {
  const [session, setSession] = useState(null);
  const { data, addSchool, deleteSchool, addStudent, updateFees, deleteStudent } = useStorage(session);
  const [view, setView] = useState('dashboard'); // dashboard, schools, students, add-school, add-student
  const [activeSchool, setActiveSchool] = useState(null);

  // Form States
  const [schoolName, setSchoolName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [totalFees, setTotalFees] = useState('');
  const [admissionDate, setAdmissionDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // PIN Privacy states
  const [isLocked, setIsLocked] = useState(true);
  const [userPin, setUserPin] = useState('');
  const userPinKey = `app_privacy_pin_${session?.user?.id}`;
  const savedPin = localStorage.getItem(userPinKey);

  // UI States (Moved to top to fix React Hook order)
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk Message Queue
  const [messageQueue, setMessageQueue] = useState([]);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (userPin === savedPin) {
      setIsLocked(false);
    } else {
      alert('Incorrect PIN');
      setUserPin('');
    }
  };

  const handleSetPin = (e) => {
    e.preventDefault();
    if (userPin.length === 4) {
      localStorage.setItem(userPinKey, userPin);
      setIsLocked(false);
      alert('PIN Set Successfully!');
    } else {
      alert('PIN must be 4 digits');
    }
  };

  if (!session) {
    return <Auth onLogin={() => setView('dashboard')} />;
  }

  // Show PIN Lock if PIN exists and app is locked
  if (savedPin && isLocked) {
    return (
      <div className="container animate-in" style={{ padding: '50px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🔒</div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>Enter Privacy PIN</h2>
        <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>Protecting your business data</p>
        <form onSubmit={handlePinSubmit} style={{ marginTop: '30px' }}>
          <input
            type="password"
            pattern="[0-9]*"
            inputMode="numeric"
            maxLength="4"
            value={userPin}
            onChange={e => setUserPin(e.target.value)}
            style={{
              fontSize: '2rem',
              textAlign: 'center',
              letterSpacing: '10px',
              width: '100%',
              maxWidth: '220px',
              padding: '15px',
              borderRadius: '20px',
              background: 'var(--card)',
              border: '2px solid var(--primary)'
            }}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '30px' }}>Unlock Dashboard</button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: '10px' }}
            onClick={() => supabase.auth.signOut()}
          >
            Switch Account
          </button>
        </form>
      </div>
    );
  }

  // Show "Set PIN" if no PIN exists (one-time setup)
  if (!savedPin && view === 'settings-pin') {
    return (
      <div className="container animate-in" style={{ padding: '40px 20px' }}>
        <h2>Set Privacy PIN</h2>
        <p style={{ color: 'var(--text-light)', marginBottom: '20px' }}>Choose a 4-digit PIN to lock your student data.</p>
        <form onSubmit={handleSetPin}>
          <div className="input-group">
            <label>New 4-Digit PIN</label>
            <input type="password" pattern="[0-9]*" inputMode="numeric" maxLength="4" value={userPin} onChange={e => setUserPin(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save PIN</button>
          <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: '10px' }} onClick={() => setView('dashboard')}>Cancel</button>
        </form>
      </div>
    );
  }

  const handleAddSchool = (e) => {
    e.preventDefault();
    if (!schoolName) return;
    addSchool(schoolName);
    setSchoolName('');
    setView('schools');
  };

  const handleAddStudent = (e) => {
    e.preventDefault();
    if (!studentName || !parentPhone || !activeSchool) return;
    addStudent({
      name: studentName,
      parentPhone,
      totalFees: Number(totalFees),
      schoolId: activeSchool.id,
      admissionDate: admissionDate
    });
    setStudentName('');
    setParentPhone('');
    setTotalFees('');
    const d = new Date();
    setAdmissionDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    setView('students');
  };

  const sendSms = (student) => {
    const message = `Hello, this is your van driver. Fee updated for ${student.name}. Paid: ${student.paidFees}, Pending: ${student.pendingFees}. Thank you!`;
    window.location.href = `sms:${student.parentPhone}?body=${encodeURIComponent(message)}`;
  };

  const sendWhatsApp = (student, customMsg = null) => {
    // Ensure phone starts with 91 if it's 10 digits
    let phone = student.parentPhone.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const message = customMsg || `Dear Parent, This is to inform you that the school van fee for this month has ended kindly pay the van fee at your earliest convenience. Thank You.`;

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const sendPaymentConfirmation = (student, amount, method) => {
    const today = new Date().toLocaleDateString('en-IN');
    const msg = `Dear Parent, ₹${amount} for school van fee has been received on ${today}. Thank you for your Payment.`;

    if (method === 'whatsapp') {
      sendWhatsApp(student, msg);
    } else {
      window.location.href = `sms:${student.parentPhone}?body=${encodeURIComponent(msg)}`;
    }
  };

  const startBulkWhatsApp = (students) => {
    if (students.length === 0) return alert("No students to message!");
    setMessageQueue(students);
    setIsQueueOpen(true);
  };

  const processNextInQueue = () => {
    if (messageQueue.length === 0) return;
    const current = messageQueue[0];
    sendWhatsApp(current);

    // Remove the first item after a short delay so the UI feels responsive
    const remaining = messageQueue.slice(1);
    setMessageQueue(remaining);
    if (remaining.length === 0) setIsQueueOpen(false);
  };

  const renderDashboard = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    const studentsArr = data.students || [];

    // Students who just rolled over their cycle today or are still pending
    const dueStudents = studentsArr.filter(s => {
      return s.lastBilledDate === todayStr && s.pendingFees > 0;
    });

    return (
      <div className="animate-in">
        <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', letterSpacing: '-0.5px' }}>SADGURU BUS SERVICES</h1>
            <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>{session.user.email}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <ThemeToggle />
            <button
              onClick={() => supabase.auth.signOut()}
              className="btn-logout"
            >
              Logout 👋
            </button>
          </div>
        </header>

        {dueStudents.length > 0 && (
          <div className="card pulsing-border" style={{ borderLeft: '4px solid var(--warning)', background: '#fffbeb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ color: '#92400e', margin: 0 }}>🚨 Month Ended! ({dueStudents.length})</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-outline"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: '#22c55e', color: '#22c55e', background: 'white', width: 'auto' }}
                  onClick={() => {
                    if (confirm(`Send Fee Reminders to ${dueStudents.length} parents?`)) {
                      startBulkWhatsApp(dueStudents);
                    }
                  }}
                >
                  🟢 Remind All
                </button>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', marginBottom: '15px' }}>These students' cycles ended today. Send them clinical feedback.</p>
            <div style={{ display: 'grid', gap: '8px' }}>
              {dueStudents.map(student => (
                <div key={student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{student.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#b45309' }}>Total Due: ₹{student.pendingFees}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      className="btn btn-outline"
                      style={{ padding: '8px 15px', fontSize: '1rem', borderColor: '#22c55e', color: '#22c55e', width: 'auto' }}
                      onClick={() => sendWhatsApp(student)}
                      title="WhatsApp Reminder"
                    >
                      🟢 Send
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card glass">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '15px' }}>Quick Stats 📊</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '600', marginBottom: '4px' }}>Schools</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '800' }}>{data.schools.length}</div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: '600', marginBottom: '4px' }}>Students</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '800' }}>{data.students.length}</div>
            </div>
          </div>

          <div style={{ marginTop: '15px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <button
              onClick={() => setView('settings-pin')}
              style={{ background: 'none', color: 'var(--primary)', fontSize: '0.85rem', padding: '0' }}
            >
              {savedPin ? '🔒 Change Privacy PIN' : '🛡️ Setup Privacy PIN (Recommended)'}
            </button>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => setView('add-school')}>
          + Add New School
        </button>
      </div>
    );
  };

  const renderSchools = () => (
    <div className="animate-in">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Your Schools</h2>
        <button onClick={() => setView('add-school')}>+ Add</button>
      </div>
      {data.schools.length === 0 ? (
        <p>No schools added yet.</p>
      ) : (
        data.schools.map(school => (
          <div key={school.id} className="card" onClick={() => { setActiveSchool(school); setView('students'); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{school.name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
                  {data.students.filter(s => s.schoolId === school.id).length} Students
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm('Delete this school?')) deleteSchool(school.id); }}
                className="btn btn-danger"
                style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto' }}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );


  const renderStudents = () => {
    const schoolStudents = data.students.filter(s => s.schoolId === activeSchool?.id);
    return (
      <div className="animate-in">
        <div className="header">
          <button
            onClick={() => setView('schools')}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.85rem', marginBottom: '10px', width: 'auto' }}
          >
            ← Back
          </button>
          <h2>{activeSchool?.name}</h2>
        </div>

        <div className="input-group" style={{ marginBottom: '15px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }}>🔍</span>
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setView('add-student')}>
            + Add Student
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
            const unpaid = schoolStudents.filter(s => s.pendingFees > 0);
            if (unpaid.length === 0) return alert("All fees are paid!");
            if (confirm(`Send reminders to ${unpaid.length} students?`)) {
              startBulkWhatsApp(unpaid);
            }
          }}>
            🟢 WhatsApp All
          </button>
        </div>

        {schoolStudents.length === 0 ? (
          <p>No students in this school.</p>
        ) : (
          schoolStudents
            .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.parentPhone.includes(searchQuery))
            .map(student => (
              <div key={student.id} className="card" onClick={() => { setSelectedStudent(student); setView('student-detail'); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{student.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{student.parentPhone}</div>
                  </div>
                  <div className={`badge ${student.pendingFees <= 0 ? 'badge-paid' : 'badge-pending'}`}>
                    {student.pendingFees <= 0 ? 'Paid' : 'Pending'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '5px' }}>
                  <span>Paid: <b>₹{student.paidFees}</b></span>
                  <span>Pending: <b style={{ color: 'var(--danger)' }}>₹{student.pendingFees}</b></span>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete this student?')) deleteStudent(student.id); }}
                    className="btn btn-danger"
                    style={{ padding: '6px 10px', fontSize: '0.75rem', width: 'auto' }}
                  >
                    🗑️
                  </button>
                </div>

                {student.lastPaidDate && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                    Last: {student.lastPaidDate}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    );
  };


  const renderStudentDetail = () => {
    if (!selectedStudent) return null;

    const handlePaymentSubmit = (e) => {
      e.preventDefault();
      if (!paymentAmount) return;
      const amount = Number(paymentAmount);
      updateFees(selectedStudent.id, amount);
      // Refresh local view data for the UI
      selectedStudent.paidFees += amount;
      selectedStudent.pendingFees -= amount;

      const confirmMsg = `Payment of ₹${amount} recorded for ${selectedStudent.name}. Send confirmation message?`;
      const sendChoice = confirm(confirmMsg + "\n\nPress OK for WhatsApp, Cancel for no message.");

      if (sendChoice) {
        sendPaymentConfirmation(selectedStudent, amount, 'whatsapp');
      }

      setPaymentAmount('');
      setIsPaymentModalOpen(false);
    };

    return (
      <div className="animate-in">
        <div className="header">
          <button
            onClick={() => setView('students')}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.85rem', marginBottom: '10px', width: 'auto' }}
          >
            ← Back
          </button>
          <h2>Student Details</h2>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h3 style={{ marginBottom: '15px' }}>{selectedStudent.name}</h3>
          <div style={{ display: 'grid', gap: '10px', fontSize: '0.95rem' }}>
            <div>📅 <b>Admission:</b> {selectedStudent.admissionDate}</div>
            <div>🗓️ <b>Next Billing:</b> {(() => {
              const last = new Date(selectedStudent.lastBilledDate || selectedStudent.admissionDate);
              last.setMonth(last.getMonth() + 1);
              return last.toLocaleDateString('en-IN');
            })()}</div>
            <div>📞 <b>Phone:</b> {selectedStudent.parentPhone}</div>
            <div>🏫 <b>School:</b> {activeSchool?.name}</div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '5px' }}>
              <div>💰 <b>Monthly Fee:</b> ₹{selectedStudent.totalFees}</div>
              <div>✅ <b>Total Paid:</b> ₹{selectedStudent.paidFees}</div>
              <div>⏳ <b>Total Pending:</b> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>₹{selectedStudent.pendingFees}</span></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <button className="btn btn-primary" onClick={() => setIsPaymentModalOpen(true)}>Receive Payment</button>
          <button className="btn btn-outline" style={{ borderColor: '#22c55e', color: '#22c55e' }} onClick={() => sendWhatsApp(selectedStudent)}>WhatsApp</button>
        </div>
        <button className="btn btn-secondary" style={{ width: '100%', marginBottom: '20px' }} onClick={() => sendSms(selectedStudent)}>Send SMS</button>

        <h3>Payment History</h3>
        <div style={{ marginTop: '10px' }}>
          {(!selectedStudent.paymentHistory || selectedStudent.paymentHistory.length === 0) ? (
            <p style={{ color: 'var(--text-light)' }}>No payments recorded yet.</p>
          ) : (
            selectedStudent.paymentHistory.map((p, i) => (
              <div key={i} className="card" style={{ padding: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>₹{p.amount}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{p.date}</div>
                </div>
                <div style={{ color: 'var(--success)', fontSize: '0.8rem' }}>Paid ✅</div>
              </div>
            ))
          )}
        </div>

        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          student={selectedStudent}
          amount={paymentAmount}
          setAmount={setPaymentAmount}
          onConfirm={handlePaymentSubmit}
        />
      </div>
    );
  };

  const renderAddSchool = () => (
    <form onSubmit={handleAddSchool} className="animate-in">
      <h2>Add New School</h2>
      <div className="input-group">
        <label>School Name</label>
        <input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. St. Xavier School" required />
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit" className="btn btn-primary">Save School</button>
        <button type="button" className="btn btn-secondary" onClick={() => setView('dashboard')}>Cancel</button>
      </div>
    </form>
  );

  const renderAddStudent = () => (
    <form onSubmit={handleAddStudent} className="animate-in">
      <h2>Add Student to {activeSchool?.name}</h2>
      <div className="input-group">
        <label>Student Name</label>
        <input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Full Name" required />
      </div>
      <div className="input-group">
        <label>Parent Phone Number</label>
        <input value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="Phone Number" required />
      </div>
      <div className="input-group">
        <label>Admission Date</label>
        <input type="date" value={admissionDate} onChange={e => setAdmissionDate(e.target.value)} required />
      </div>
      <div className="input-group">
        <label>Total Monthly Fee (₹)</label>
        <input type="number" value={totalFees} onChange={e => setTotalFees(e.target.value)} placeholder="500" required />
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit" className="btn btn-primary">Add Student</button>
        <button type="button" className="btn btn-secondary" onClick={() => setView('students')}>Cancel</button>
      </div>
    </form>
  );

  return (
    <div className="container">
      <main style={{ flex: 1, paddingBottom: '80px' }}>
        {view === 'dashboard' && renderDashboard()}
        {view === 'schools' && renderSchools()}
        {view === 'students' && renderStudents()}
        {view === 'student-detail' && renderStudentDetail()}
        {view === 'add-school' && renderAddSchool()}
        {view === 'add-student' && renderAddStudent()}
      </main>

      <BulkMessageModal
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        queue={messageQueue}
        onProcessNext={processNextInQueue}
        onSkip={() => setMessageQueue(prev => prev.slice(1))}
      />

      <nav className="footer-nav">
        <a href="#" className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
          <span>🏠</span>
          <span>Home</span>
        </a>
        <a href="#" className={`nav-item ${view === 'schools' || view === 'students' ? 'active' : ''}`} onClick={() => setView('schools')}>
          <span>🏫</span>
          <span>Schools</span>
        </a>
        <a href="#" className="nav-item">
          <span>⚡</span>
          <span>Reports</span>
        </a>
      </nav>
    </div>
  );
};

export default App;
