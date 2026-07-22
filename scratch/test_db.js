import mongoose from 'mongoose';
import { Student } from '../backend/models/Student.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/eligibility-flow';
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const total = await Student.countDocuments();
  console.log('Total students in DB:', total);

  const sample = await Student.find({}).limit(10).lean();
  console.log('Sample 10 students from DB:');
  sample.forEach(s => console.log({ id: s._id, name: s.name, rollNo: s.rollNo, enrollmentNo: s.enrollmentNo, registrationNo: s.registrationNo, grNo: s.grNo, studentId: s.studentId, universityId: s.universityId }));

  const sampleRolls = ['2553988', '2553991', '2517008003', '2517008014', '2517008015'];
  const matchedByRoll = await Student.find({ rollNo: { $in: sampleRolls } }).lean();
  const matchedByEnrollment = await Student.find({ enrollmentNo: { $in: sampleRolls } }).lean();
  const matchedByReg = await Student.find({ registrationNo: { $in: sampleRolls } }).lean();
  const matchedByGr = await Student.find({ grNo: { $in: sampleRolls } }).lean();
  const matchedByStudentId = await Student.find({ studentId: { $in: sampleRolls } }).lean();
  const matchedByUniId = await Student.find({ universityId: { $in: sampleRolls } }).lean();

  console.log('Matched by rollNo:', matchedByRoll.length, matchedByRoll.map(s => s.name));
  console.log('Matched by enrollmentNo:', matchedByEnrollment.length, matchedByEnrollment.map(s => s.name));
  console.log('Matched by registrationNo:', matchedByReg.length, matchedByReg.map(s => s.name));
  console.log('Matched by grNo:', matchedByGr.length, matchedByGr.map(s => s.name));
  console.log('Matched by studentId:', matchedByStudentId.length, matchedByStudentId.map(s => s.name));
  console.log('Matched by universityId:', matchedByUniId.length, matchedByUniId.map(s => s.name));

  // Also check sample names from image
  const sampleNames = ['Evensh', 'Manav Singh', 'Mohit', 'Nikhil Kumar', 'Preeti Thakur', 'Sejal', 'Tanisha', 'VIDUSHI DHIMAN', 'Yashika', 'Rohit bhoria', 'Priyanshu Shekha'];
  const matchedNames = await Student.find({ name: { $in: sampleNames.map(n => new RegExp(`^${n}$`, 'i')) } }).lean();
  console.log('Matched by Name:', matchedNames.length, matchedNames.map(s => `${s.name} (roll: ${s.rollNo}, enroll: ${s.enrollmentNo}, reg: ${s.registrationNo}, uniId: ${s.universityId})`));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
