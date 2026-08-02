

	#ifndef	_JOINT_H
	#define	_JOINT_H
	#endif

	#ifndef _TRAJECT_H
	#include "traject.h"
	#endif

	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif

	#ifndef _JOINTYP_H
	#include "jointyp.h"



	class	Joint
	{
			protected:
				// data members ...
				Trajectory**	m_ppTrajectory;
				float*			m_pfPoint;
				UINT			m_uiNrOfPoints;
				UINT			m_uiNrOfTrajectories;
				float			m_fJointTime;

				// physical characteristics ...
				float			m_fMaxSpeed;
				float			m_fMaxAcceleration;

				// quantification variables ...
				UINT*			m_puiTCA;			// Time Constant Array
				UINT			m_uiQuantum;
				UINT			m_uiDivisions;		// not the same as at the trajectory class !
				DWORD*			m_pdwNrOfQPerDivision;
				DWORD			m_dwStepsToExecute;
				DWORD			m_dwStepsResulted;

			public:
				float			GetTime( UINT );
				UINT*			GetPointerToTCA();
				UINT			GetNrOfDivisions();
				DWORD			GetNQPDForTrajectory( UINT );
				UINT			GetDirectionForTrajectory( UINT );
				UINT			GetNrOfTrajectories();
				BOOL			SetTimeTo( float, UINT );
				BOOL			SetNrOfPointsTo( UINT );
				BOOL			SetMaxDivisionsTo( UINT );
				BOOL			SetQuantumTo( UINT );
				BOOL			Setup();
				BOOL			Show();
				BOOL			DumpOut();
				BOOL			ComputeNQPD();
				BOOL			ComputeTCA();
				BOOL			ComputeJointTime();
				BOOL			Compute();

				Joint();		// constructor ...
				~Joint();		// destructor  ...

	};

	#endif