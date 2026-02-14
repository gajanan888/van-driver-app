import { useState, useEffect } from 'react';
import { supabase } from './supabase';

const STORAGE_KEY = 'van_driver_app_data';

const useStorage = (session) => {
    const [data, setData] = useState({ schools: [], students: [] });
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // Dynamic storage key based on user ID for privacy
    const userStorageKey = session ? `${STORAGE_KEY}_${session.user.id}` : STORAGE_KEY;

    // Load data from Supabase or fallback to LocalStorage
    useEffect(() => {
        setData({ schools: [], students: [] }); // Clear data immediately on session change
        if (session) {
            fetchCloudData();
        } else {
            const saved = localStorage.getItem(userStorageKey);
            if (saved) setData(JSON.parse(saved));
            setIsInitialLoad(false);
        }
    }, [session, userStorageKey]);

    const fetchCloudData = async () => {
        const { data: schools, error: schoolError } = await supabase
            .from('schools')
            .select('*')
            .eq('user_id', session.user.id);

        const { data: students, error: studentError } = await supabase
            .from('students')
            .select('*')
            .eq('user_id', session.user.id);

        if (!schoolError && !studentError) {
            const safeSchools = schools || [];
            const safeStudents = students || [];

            // If cloud is empty but local has user-specific data, migrate!
            if (safeSchools.length === 0 && safeStudents.length === 0) {
                const local = localStorage.getItem(userStorageKey);
                if (local) {
                    const localData = JSON.parse(local);
                    if (localData.schools.length > 0 || localData.students.length > 0) {
                        migrateToCloud(localData);
                        return;
                    }
                }
            }
            setData({ schools: safeSchools, students: safeStudents });
            setIsInitialLoad(false);
        }
    };

    const migrateToCloud = async (localData) => {
        const userId = session.user.id;

        // Migrate schools
        const schoolsToUpload = localData.schools.map(({ id, ...rest }) => ({ ...rest, user_id: userId }));
        const { data: newSchools } = await supabase.from('schools').insert(schoolsToUpload).select();

        // Migrate students (need to map old school IDs to new ones)
        const studentsToUpload = localData.students.map(({ id, ...rest }) => {
            // Find the school name for the old ID to match with new school record
            const oldSchool = localData.schools.find(s => s.id === rest.schoolId);
            const newSchool = newSchools.find(s => s.name === oldSchool?.name);
            return { ...rest, schoolId: newSchool?.id || rest.schoolId, user_id: userId };
        });

        await supabase.from('students').insert(studentsToUpload);
        fetchCloudData();
    };

    useEffect(() => {
        if (!isInitialLoad && session) {
            localStorage.setItem(userStorageKey, JSON.stringify(data));
        }
    }, [data, isInitialLoad, userStorageKey]);

    useEffect(() => {
        if (!isInitialLoad && data.students.length > 0) {
            performBilling();
        }
    }, [isInitialLoad, data.students]);

    const performBilling = () => {
        const getLocalDateString = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const today = new Date();
        const todayStr = getLocalDateString(today);
        let changed = false;

        const updatedStudents = data.students.map(s => {
            // Parse admission date carefully to avoid timezone shifts
            const [y, m, d] = s.admissionDate.split('-').map(Number);
            const admission = new Date(y, m - 1, d);

            // Parse last billed date or admission date
            const [by, bm, bd] = (s.lastBilledDate || s.admissionDate).split('-').map(Number);
            const lastBill = new Date(by, bm - 1, bd);

            // Calculate next billing date based on the admission day
            let nextBill = new Date(lastBill);
            nextBill.setMonth(nextBill.getMonth() + 1);

            let monthsToBill = 0;
            let tempNextBill = new Date(nextBill);

            // Compare using local year/month/day
            while (getLocalDateString(tempNextBill) <= todayStr) {
                monthsToBill++;
                tempNextBill.setMonth(tempNextBill.getMonth() + 1);
            }

            if (monthsToBill > 0) {
                changed = true;
                const finalBilledDate = new Date(lastBill);
                finalBilledDate.setMonth(finalBilledDate.getMonth() + monthsToBill);
                const newBilledDateStr = getLocalDateString(finalBilledDate);

                const additionalFees = monthsToBill * Number(s.totalFees);
                const newPending = Number(s.pendingFees) + additionalFees;

                if (session) {
                    supabase.from('students').update({
                        pendingFees: newPending,
                        lastBilledDate: newBilledDateStr
                    }).eq('id', s.id).then();
                }

                return {
                    ...s,
                    pendingFees: newPending,
                    lastBilledDate: newBilledDateStr
                };
            }
            return s;
        });

        if (changed) setData(prev => ({ ...prev, students: updatedStudents }));
    };

    const addSchool = async (name) => {
        const newSchool = { name };
        try {
            if (session) {
                const { data: record, error } = await supabase.from('schools').insert([{ ...newSchool, user_id: session.user.id }]).select();
                if (error) {
                    alert("Error adding school: " + error.message);
                    return;
                }
                if (record) setData(prev => ({ ...prev, schools: [...prev.schools, record[0]] }));
            } else {
                const localRecord = { ...newSchool, id: Date.now().toString() };
                setData(prev => ({ ...prev, schools: [...prev.schools, localRecord] }));
            }
        } catch (err) {
            console.error(err);
            alert("Network Error: Could not connect to the cloud. Please check your internet connection.");
        }
    };

    const deleteSchool = async (id) => {
        if (session) {
            await supabase.from('schools').delete().eq('id', id);
            await supabase.from('students').delete().eq('schoolId', id);
        }
        setData(prev => ({
            ...prev,
            schools: prev.schools.filter(s => s.id !== id),
            students: prev.students.filter(s => s.schoolId !== id)
        }));
    };

    const addStudent = async (student) => {
        const admission = student.admissionDate;
        const newStudent = {
            ...student,
            admissionDate: admission,
            lastBilledDate: admission,
            paidFees: 0,
            pendingFees: 0,
            paymentHistory: []
        };

        try {
            if (session) {
                const { data: record, error } = await supabase.from('students').insert([{ ...newStudent, user_id: session.user.id }]).select();
                if (error) {
                    alert("Error adding student: " + error.message);
                    return;
                }
                if (record) setData(prev => ({ ...prev, students: [...prev.students, record[0]] }));
            } else {
                const localRecord = { ...newStudent, id: Date.now().toString() };
                setData(prev => ({ ...prev, students: [...prev.students, localRecord] }));
            }
        } catch (err) {
            console.error(err);
            alert("Network Error: Failed to add student. Please check your internet connection.");
        }
    };

    const updateFees = async (studentId, paidAmount) => {
        const today = new Date().toLocaleDateString('en-IN');
        const student = data.students.find(s => s.id === studentId);
        if (!student) return;

        const newPaidTotal = Number(student.paidFees) + Number(paidAmount);
        const newPending = Math.max(0, Number(student.pendingFees) - Number(paidAmount));
        const newPayment = { amount: Number(paidAmount), date: today };
        const newHistory = [newPayment, ...(student.paymentHistory || [])];

        try {
            if (session) {
                const { error } = await supabase.from('students').update({
                    paidFees: newPaidTotal,
                    pendingFees: newPending,
                    paymentHistory: newHistory,
                    lastPaidDate: today
                }).eq('id', studentId);

                if (error) {
                    alert("Error updating fees: " + error.message);
                    return;
                }
            }

            setData(prev => ({
                ...prev,
                students: prev.students.map(s => s.id === studentId ? {
                    ...s,
                    paidFees: newPaidTotal,
                    pendingFees: newPending,
                    paymentHistory: newHistory,
                    lastPaidDate: today
                } : s)
            }));
        } catch (err) {
            console.error(err);
            alert("Network Error: Could not save payment to cloud. Please check your internet.");
        }
    };

    const deleteStudent = async (id) => {
        if (session) {
            await supabase.from('students').delete().eq('id', id);
        }
        setData(prev => ({
            ...prev,
            students: prev.students.filter(s => s.id !== id)
        }));
    };

    return {
        data,
        addSchool,
        deleteSchool,
        addStudent,
        updateFees,
        deleteStudent
    };
};

export default useStorage;
