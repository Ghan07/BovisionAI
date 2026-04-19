import Classification from '../models/Classification.js';
import Image from '../models/Image.js';
import Animal from '../models/Animal.js';
import User from '../models/User.js';
import { classifyAnimal } from '../services/classificationEngine.js';

export const createClassification = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image' });
    }

    // Demo account limit: max 3 classifications
    if (req.user.isDemo) {
      if (req.user.demoClassifications >= 3) {
        return res.status(403).json({
          success: false,
          message: 'Demo limit reached. Please create an account to continue classifying.',
          demoLimitReached: true,
        });
      }
    }

    const image = await Image.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      user: req.user._id,
    });

    // Pass image buffer (from multer memoryStorage) + Cloudinary URL to engine
    const imageForML = { ...image.toObject(), buffer: req.file.buffer };
    const { measurements, atcResult, processingTime } = await classifyAnimal(imageForML);

    let animal = null;
    if (req.body.animalTag) {
      animal = await Animal.findOne({ tag: req.body.animalTag });
      if (!animal) {
        animal = await Animal.create({
          tag: req.body.animalTag,
          species: atcResult.animalType,
          breed: atcResult.breedPrediction,
          owner: req.user._id,
        });
      }
    }

    const classification = await Classification.create({
      user: req.user._id,
      animal: animal?._id,
      image: image._id,
      measurements,
      atcResult,
      status: 'completed',
      processingTime,
      notes: req.body.notes || '',
    });

    // Increment demo counter
    if (req.user.isDemo) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { demoClassifications: 1 } });
    }

    const populated = await Classification.findById(classification._id).populate('image').populate('animal');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

export const getClassifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, sort = '-createdAt', animalType, status, search, startDate, endDate } = req.query;

    const query = { user: req.user._id };
    if (animalType) query['atcResult.animalType'] = animalType;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [results, total] = await Promise.all([
      Classification.find(query).populate('image').populate('animal').sort(sort).skip(skip).limit(parseInt(limit)),
      Classification.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    next(error);
  }
};

export const getClassification = async (req, res, next) => {
  try {
    const classification = await Classification.findOne({ _id: req.params.id, user: req.user._id }).populate('image').populate('animal');
    if (!classification) {
      return res.status(404).json({ success: false, message: 'Classification not found' });
    }
    res.json({ success: true, data: classification });
  } catch (error) {
    next(error);
  }
};

export const deleteClassification = async (req, res, next) => {
  try {
    const classification = await Classification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!classification) {
      return res.status(404).json({ success: false, message: 'Classification not found' });
    }
    res.json({ success: true, message: 'Classification deleted' });
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const [total, completed, cattleCount, buffaloCount, recentClassifications, last30Days] = await Promise.all([
      Classification.countDocuments({ user: userId }),
      Classification.countDocuments({ user: userId, status: 'completed' }),
      Classification.countDocuments({ user: userId, 'atcResult.animalType': 'cattle' }),
      Classification.countDocuments({ user: userId, 'atcResult.animalType': 'buffalo' }),
      Classification.find({ user: userId }).populate('image').sort('-createdAt').limit(5),
      Classification.find({
        user: userId,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }).select('atcResult.animalType atcResult.confidence atcResult.atcScore createdAt'),
    ]);

    const avgConfidence = last30Days.length > 0
      ? last30Days.reduce((acc, c) => acc + c.atcResult.confidence, 0) / last30Days.length
      : 0;

    const avgAtcScore = last30Days.length > 0
      ? last30Days.reduce((acc, c) => acc + c.atcResult.atcScore, 0) / last30Days.length
      : 0;

    // Group by day for chart
    const dailyStats = {};
    last30Days.forEach(c => {
      const day = c.createdAt.toISOString().split('T')[0];
      if (!dailyStats[day]) dailyStats[day] = { date: day, cattle: 0, buffalo: 0, total: 0 };
      dailyStats[day][c.atcResult.animalType]++;
      dailyStats[day].total++;
    });

    const uniqueAnimals = await Classification.distinct('animal', { user: userId, animal: { $ne: null } });

    res.json({
      success: true,
      data: {
        totalClassifications: total,
        completedClassifications: completed,
        cattleCount,
        buffaloCount,
        avgConfidence: Number(avgConfidence.toFixed(3)),
        avgAtcScore: Number(avgAtcScore.toFixed(1)),
        uniqueAnimals: uniqueAnimals.length,
        recentClassifications,
        dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
        distribution: { cattle: cattleCount, buffalo: buffaloCount },
      },
    });
  } catch (error) {
    next(error);
  }
};
