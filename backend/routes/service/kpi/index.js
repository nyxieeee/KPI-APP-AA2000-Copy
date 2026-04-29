const express = require('express');
const router = express.Router();

const Criteria = require('../../../models/KPI/criteriaModel');
const CriteriaRating = require('../../../models/KPI/criteriaRatingModel');
const Employee_Score = require('../../../models/KPI/scoreModel');

// /service/kpi/get/criteria
router.get('/get/criteria', async (_req, res) => {
    try {
        const criteriaList = await Criteria.findAll();

        return res.status(200).json({
            success: true,
            message: 'Criteria fetched successfully.',
            data: criteriaList
        });
    } catch (error) {
        console.error('Error fetching criteria:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message
        });
    }
});

// /service/kpi/get/scores/:empId
router.get('/get/scores/:empId', async (req, res) => {
    try {
        const { empId } = req.params;

        const employeeScores = await Employee_Score.findAll({
            where: { Emp_ID: empId },
            order: [['createdAt', 'DESC']]
        });

        if (!employeeScores || employeeScores.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No scores found for this employee.',
                data: []
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Employee scores fetched successfully.',
            data: employeeScores
        });
    } catch (error) {
        console.error('Error fetching employee scores:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message
        });
    }
});

// /service/kpi/post/save/criteria_admin
router.post('/save/criteria_admin', async (req, res) => {
    try {
        const { c_ID, r_ID, rate_1, rate_2, rate_3, rate_4, rate_5, rate_6 } = req.body;

        if (!c_ID || !r_ID) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: c_ID and r_ID are mandatory.'
            });
        }

        const savedRating = await CriteriaRating.create({
            c_ID,
            r_ID,
            rate_1,
            rate_2,
            rate_3,
            rate_4,
            rate_5,
            rate_6
        });

        return res.status(201).json({
            success: true,
            message: 'Ratings saved successfully!',
            data: savedRating
        });
    } catch (error) {
        console.error('Error saving criteria ratings:', error);

        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                success: false,
                message: 'A rating for this criteria by this user already exists.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'An internal server error occurred while saving the ratings.'
        });
    }
});

// /service/kpi/post/save/criteria_user
router.post('/save/criteria_user', async (req, res) => {
    try {
        const { r_ID, rate_1, rate_2, rate_3, rate_4, rate_5, rate_6 } = req.body;

        if (!r_ID) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID (r_ID) is required.'
            });
        }

        const newScore = await Employee_Score.create({
            Emp_ID: r_ID,
            rating_1: rate_1,
            rating_2: rate_2,
            rating_3: rate_3,
            rating_4: rate_4,
            rating_5: rate_5,
            rating_6: rate_6
        });

        return res.status(201).json({
            success: true,
            message: 'Employee score saved successfully!',
            data: newScore
        });
    } catch (error) {
        console.error('Error saving criteria user data:', error);
        return res.status(500).json({
            success: false,
            message: 'An internal server error occurred.',
            error: error.message
        });
    }
});

// /service/kpi/put/update/criteria_admin
router.put('/update/criteria_admin', async (req, res) => {
    try {
        const { c_ID, r_ID, rate_1, rate_2, rate_3, rate_4, rate_5, rate_6 } = req.body;

        if (!c_ID) {
            return res.status(400).json({
                success: false,
                message: 'Score ID (c_ID) is required to perform an update.'
            });
        }

        const [updatedRows] = await Employee_Score.update(
            {
                Emp_ID: r_ID,
                rating_1: rate_1,
                rating_2: rate_2,
                rating_3: rate_3,
                rating_4: rate_4,
                rating_5: rate_5,
                rating_6: rate_6
            },
            { where: { score_ID: c_ID } }
        );

        if (updatedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Record not found. No update was made.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Admin update successful!'
        });
    } catch (error) {
        console.error('Error in admin update:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message
        });
    }
});

// /service/kpi/put/update/criteria_user
router.put('/update/criteria_user', async (req, res) => {
    try {
        const { c_ID, rate_1, rate_2, rate_3, rate_4, rate_5, rate_6 } = req.body;

        if (!c_ID) {
            return res.status(400).json({
                success: false,
                message: 'Score ID (c_ID) is required.'
            });
        }

        const [updatedRows] = await Employee_Score.update(
            {
                rating_1: rate_1,
                rating_2: rate_2,
                rating_3: rate_3,
                rating_4: rate_4,
                rating_5: rate_5,
                rating_6: rate_6
            },
            {
                where: {
                    score_ID: c_ID,
                    Status: 'PENDING'
                }
            }
        );

        if (updatedRows === 0) {
            return res.status(403).json({
                success: false,
                message: 'Update failed. The record might not exist, or the status is no longer PENDING.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'User criteria updated successfully!'
        });
    } catch (error) {
        console.error('Error in user update:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message
        });
    }
});

module.exports = router;
