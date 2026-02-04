import { useState, useEffect } from 'react';
import { supabase } from './supabase';

const STORAGE_KEY = 'van_driver_app_data';

const useStorage = (session) => {
    const [data, setData] = useState({ schools: [], students: [] });
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // Load data from Supabase or fallback to LocalStorage
    useEffect(() => {
        if (session) {
            fetchCloudData();
        } else {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) setData(JSON.parse(saved));
        }
    }, [session]);

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

            // If cloud is empty but local has data, migrate!
            if (safeSchools.length === 0 && safeStudents.length === 0) {
                const local = localStorage.getItem(STORAGE_KEY);
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
        if (!isInitialLoad) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    }, [data, isInitialLoad]);

    useEffect(() => {
        if (data.students.length > 0) {
            performBilling();
        }
    }, [isInitialLoad]);

    const performBilling = () => {
        const today = new Date();
        let changed = false;

        const updatedStudents = data.students.map(s => {
            const lastBill = new Date(s.lastBilledDate || s.admissionDate);
            let monthsPassed = 0;

            let nextBill = new Date(lastBill);
            nextBill.setMonth(nextBill.getMonth() + 1);

            while (nextBill <= today) {
                monthsPassed++;
                nextBill.setMonth(nextBill.getMonth() + 1);
            }

            if (monthsPassed > 0) {
                changed = true;
                const finalBillDate = new Date(lastBill);
                finalBillDate.setMonth(finalBillDate.getMonth() + monthsPassed);

                const newPending = Number(s.pendingFees) + (monthsPassed * Number(s.totalFees));
                const newBilledDate = finalBillDate.toISOString().split('T')[0];

                // Update cloud too
                if (session) {
                    supabase.from('students').update({
                        pendingFees: newPending,
                        lastBilledDate: newBilledDate
                    }).eq('id', s.id).then();
                }

                return {
                    ...s,
                    pendingFees: newPending,
                    lastBilledDate: newBilledDate
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
        const admission = student.admissionDate || new Date().toISOString().split('T')[0];
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
        const newPending = Math.max(0, Number(student.totalFees) - newPaidTotal);
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
